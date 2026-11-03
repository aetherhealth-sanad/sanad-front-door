"""Test helpers: a manual clock and a thin client that drives cases through the API.

Tests name the criterion they verify (TC-*) or the harness rule (HR-*) so `spec-trace` can find
them. Passing tests show the software behaves as specified on synthetic data. They are not
evidence of clinical safety or validity.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from sanad_api.audit.models import AuditEvent
from sanad_api.config import MOCK_FACILITY_USERNAME, REVIEWER_USERNAME

START = datetime(2026, 11, 10, 9, 0, 0, tzinfo=UTC)
# Test-only demo passwords. Real deployments read them from the environment.
REVIEWER_PASSWORD = "test-only-reviewer"
FACILITY_PASSWORD = "test-only-facility"
CONSENT_VERSION = "CONSENT-0.1"
ALL_NO = {"SAFETY-01": "NO", "SAFETY-02": "NO", "SAFETY-03": "NO"}


class ManualClock:
    def __init__(self, start: datetime = START) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)


@dataclass
class Caller:
    client: TestClient
    token: str | None

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def get(self, path: str, **kwargs: Any) -> Response:
        return self.client.get(path, headers=self.headers, **kwargs)

    def post(self, path: str, body: Any = None, **kwargs: Any) -> Response:
        return self.client.post(path, json=body, headers=self.headers, **kwargs)

    def put(self, path: str, body: Any = None, **kwargs: Any) -> Response:
        return self.client.put(path, json=body, headers=self.headers, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> Response:
        return self.client.delete(path, headers=self.headers, **kwargs)


@dataclass
class Patient(Caller):
    case_id: str = ""

    def path(self, suffix: str) -> str:
        return f"/api/cases/{self.case_id}{suffix}"

    def state(self) -> dict[str, Any]:
        response = self.get(self.path("/state"))
        assert response.status_code == 200, response.text
        result: dict[str, Any] = response.json()
        return result

    def consent(self, **decisions: bool) -> Response:
        return self.put(
            self.path("/consent"), {"consent_version": CONSENT_VERSION, "decisions": decisions}
        )

    def load_sample(self) -> Response:
        return self.post(self.path("/profile/sample"))

    def upload(self, data: Any, *, content_type: str = "application/json") -> Response:
        raw = data if isinstance(data, bytes) else json.dumps(data).encode()
        return self.client.post(
            self.path("/profile/upload"),
            files={"file": ("profile.json", raw, content_type)},
            headers=self.headers,
        )

    def safety(self, responses: dict[str, str] | None = None) -> Response:
        answers = [
            {"question_id": question_id, "response": response}
            for question_id, response in (responses or ALL_NO).items()
        ]
        return self.post(
            self.path("/safety-check"),
            {"catalogue_version": "emergency-draft-0.1", "answers": answers},
        )

    def answers(self, *answers: dict[str, Any]) -> Response:
        return self.post(self.path("/answers"), {"answers": list(answers)})

    def assess(self, entry_path: str = "FULL_INTAKE") -> Response:
        return self.post(self.path("/assess"), {"entry_path": entry_path})

    def report(self) -> Response:
        return self.get(self.path("/report"))

    def send_for_review(self, case_version: int | None = None) -> Response:
        version = case_version if case_version is not None else self.state()["case_version"]
        return self.post(self.path("/review-requests"), {"case_version": version})

    def observe(self, **fields: Any) -> Response:
        return self.post(self.path("/observations"), fields)

    def gate(self, target: str | None = "MOCK-CLINIC-A") -> Response:
        params = {"target_mock_facility_id": target} if target else {}
        return self.get(self.path("/referral-gate"), params=params)

    def refer(self, target: str = "MOCK-CLINIC-A") -> Response:
        return self.post(self.path("/mock-referral"), {"target_mock_facility_id": target})

    def tracking(self) -> Response:
        return self.get(self.path("/tracking"))


class Api:
    def __init__(self, client: TestClient, app: FastAPI, clock: ManualClock) -> None:
        self.client = client
        self.app = app
        self.clock = clock

    def db(self) -> Session:
        session: Session = self.app.state.session_factory()
        return session

    def audit(self, case_id: str | None = None) -> list[AuditEvent]:
        with self.db() as db:
            query = db.query(AuditEvent).order_by(AuditEvent.id)
            if case_id is not None:
                query = query.filter(AuditEvent.case_id == case_id)
            return query.all()

    def audit_types(self, case_id: str) -> list[str]:
        return [event.event_type for event in self.audit(case_id)]

    def start(self, start_mode: str = "BLANK", fixture_id: str | None = None) -> Patient:
        body: dict[str, Any] = {"start_mode": start_mode}
        if fixture_id is not None:
            body["fixture_id"] = fixture_id
        response = self.client.post("/api/cases", json=body)
        assert response.status_code == 201, response.text
        data = response.json()
        return Patient(self.client, data["session_token"], data["case_id"])

    def staff(self, username: str, password: str) -> Caller:
        response = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        assert response.status_code == 200, response.text
        return Caller(self.client, response.json()["token"])

    def reviewer(self) -> Caller:
        return self.staff(REVIEWER_USERNAME, REVIEWER_PASSWORD)

    def facility(self) -> Caller:
        return self.staff(MOCK_FACILITY_USERNAME, FACILITY_PASSWORD)

    def anonymous(self) -> Caller:
        return Caller(self.client, None)

    # Journeys -------------------------------------------------------------------------------

    def consented(self, fixture_id: str = "CN-001") -> Patient:
        patient = self.start("SAMPLE", fixture_id)
        assert patient.consent(assessment=True).status_code == 200
        return patient

    def assessing(self, fixture_id: str = "CN-001") -> Patient:
        patient = self.consented(fixture_id)
        assert patient.load_sample().status_code == 200
        response = patient.safety()
        assert response.status_code == 200, response.text
        assert response.json()["state"]["state"] == "ASSESSING"
        return patient

    def drafted(self, fixture_id: str = "CN-001", *answers: dict[str, Any]) -> Patient:
        patient = self.assessing(fixture_id)
        if answers:
            assert patient.answers(*answers).status_code == 200
        response = patient.assess()
        assert response.status_code == 200, response.text
        assert response.json()["draft_ready"], response.json()
        return patient

    def pending(self, fixture_id: str = "CN-001", *answers: dict[str, Any]) -> Patient:
        patient = self.drafted(fixture_id, *answers)
        assert patient.consent(clinician_review=True).status_code == 200
        response = patient.send_for_review()
        assert response.status_code == 201, response.text
        return patient

    def decide(self, patient: Patient, decision: str, **fields: Any) -> Response:
        version = patient.state()["case_version"]
        body = {"decision": decision, "case_version": version, **fields}
        return self.reviewer().post(f"/api/reviews/{patient.case_id}/decision", body)

    def approved(self, fixture_id: str = "CN-001", *answers: dict[str, Any]) -> Patient:
        patient = self.pending(fixture_id, *answers)
        response = self.decide(patient, "APPROVE")
        assert response.status_code == 200, response.text
        return patient

    def navigating(self, fixture_id: str = "CN-001") -> Patient:
        patient = self.approved(fixture_id)
        response = patient.post(patient.path("/navigation/start"))
        assert response.status_code == 200, response.text
        return patient

    def referred(self, fixture_id: str = "CN-001") -> tuple[Patient, str]:
        patient = self.navigating(fixture_id)
        assert patient.consent(provider_share=True).status_code == 200
        response = patient.refer()
        assert response.status_code == 201, response.text
        return patient, response.json()["referral"]["referral_id"]

    def facility_event(self, referral_id: str, mock_status: str, **fields: Any) -> Response:
        return self.facility().post(
            f"/api/mock-facility/referrals/{referral_id}/events",
            {"mock_status": mock_status, **fields},
        )
