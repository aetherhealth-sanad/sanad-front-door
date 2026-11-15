"""RF-22 pinned citations and grounded explanation (T4.6).

The tests copy the catalogues to a temporary folder and pin one synthetic test passage to the
steroid rule, so the shipped passage file stays as the team left it. A fake adapter replaces the
model, so no network call is made. Passing these tests shows the wiring and refusal paths work on
synthetic input. It says nothing about the quality of any source or wording.
"""

from __future__ import annotations

import ast
import hashlib
import json
import shutil
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from sanad_api.catalogues import load_catalogues
from sanad_api.config import Settings
from sanad_api.main import create_app
from sanad_api.model_adapter.port import ModelRequest, ModelResult, ModelStatus
from tests.conftest import REPO_ROOT
from tests.helpers import FACILITY_PASSWORD, REVIEWER_PASSWORD, Api, ManualClock, Patient

PASSAGE_ID = "TEST-SOURCE:s1:0001"
EXCERPT = "SYNTHETIC TEST PASSAGE. Not taken from any guideline. Used only to test citation wiring."
STEROID_RULE = "DRAFT-STEROID-01"
SIGNAL = "REPORTS_ANABOLIC_STEROID_USE"


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def make_root(
    tmp_path: Path,
    *,
    excerpt_hash: str | None = None,
    ref_passage_id: str = PASSAGE_ID,
    ref_hash: str | None = None,
) -> Path:
    root = tmp_path / "repo"
    for name in ("rules", "catalogue", "schemas", "knowledge"):
        shutil.copytree(REPO_ROOT / name, root / name)
    shutil.copytree(REPO_ROOT / "data" / "synthetic", root / "data" / "synthetic")
    passages_path = root / "knowledge" / "passages.v0.1.json"
    passages = json.loads(passages_path.read_text(encoding="utf-8"))
    passages["passages"] = [
        {
            "passage_id": PASSAGE_ID,
            "source_id": "TEST-SOURCE",
            "source_version": "test-1",
            "title": "Synthetic test source",
            "locator": "Section 1",
            "url": "https://example.org/synthetic-test-source",
            "license": "Test only",
            "excerpt": EXCERPT,
            "content_sha256": excerpt_hash or sha(EXCERPT),
            "review_status": "TEAM_CURATED",
        }
    ]
    passages_path.write_text(json.dumps(passages, indent=2), encoding="utf-8")
    triage_path = root / "rules" / "triage.draft-0.1.json"
    triage = json.loads(triage_path.read_text(encoding="utf-8"))
    for rule in triage["rules"]:
        if rule["rule_id"] == STEROID_RULE:
            rule["evidence_refs"] = [
                {
                    "source_id": "TEST-SOURCE",
                    "version": "test-1",
                    "verification": "TEAM_CURATED",
                    "passage_id": ref_passage_id,
                    "content_sha256": ref_hash or sha(EXCERPT),
                }
            ]
    triage_path.write_text(json.dumps(triage, indent=2), encoding="utf-8")
    return root


class FakeAdapter:
    provider = "fake"
    model_id = "fake-model-1"
    label = "Fake model (tests)"

    def __init__(self) -> None:
        self.replies: list[ModelResult | Exception] = []
        self.calls: list[ModelRequest] = []

    @property
    def enabled(self) -> bool:
        return True

    def complete_json(self, request: ModelRequest) -> ModelResult:
        self.calls.append(request)
        if not self.replies:
            raise AssertionError("unexpected model call")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def reply(*sentences: tuple[str, list[str]], status: str = "EXPLAINED") -> ModelResult:
    body = {
        "status": status,
        "sentences": [{"text": text, "passage_ids": ids} for text, ids in sentences],
    }
    return ModelResult(ModelStatus.OK, json.dumps(body), attempts=1, elapsed_ms=5)


GOOD = reply(
    ("Steroid use is one reason a specialist service may be a sensible next step.", [PASSAGE_ID])
)


def build_api(tmp_path: Path, root: Path, adapter: Any = None) -> Iterator[Api]:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        repo_root=root,
        commit_sha="test-sha",
        reviewer_password=REVIEWER_PASSWORD,
        mock_facility_password=FACILITY_PASSWORD,
        cases_per_minute_per_ip=10_000,
        logins_per_minute_per_ip=10_000,
    )
    clock = ManualClock()
    app = create_app(settings, clock, model_adapter=adapter)
    with TestClient(app) as client:
        yield Api(client, app, clock)


@pytest.fixture
def fake() -> FakeAdapter:
    return FakeAdapter()


@pytest.fixture
def curated(tmp_path: Path, fake: FakeAdapter) -> Iterator[Api]:
    yield from build_api(tmp_path, make_root(tmp_path), fake)


def explain(patient: Patient) -> Any:
    return patient.post(patient.path("/report/explanation"))


def steroid_claim(report: dict[str, Any]) -> dict[str, Any]:
    return next(e for e in report["evidence"] if e["rule_id"] == STEROID_RULE)


# TC-22.1 -------------------------------------------------------------------------------------


def test_tc_22_1_a_tampered_passage_is_unusable_and_start_up_still_succeeds(
    tmp_path: Path,
) -> None:
    root = make_root(tmp_path, excerpt_hash=sha("something else"))
    catalogues = load_catalogues(root)
    assert catalogues.passage(PASSAGE_ID) is None
    intact = load_catalogues(make_root(tmp_path / "intact"))
    assert intact.passage(PASSAGE_ID) is not None


def test_tc_22_1_the_shipped_passage_file_loads() -> None:
    catalogues = load_catalogues(REPO_ROOT)
    assert catalogues.passages.catalogue_id == "evidence-passages"


# TC-22.2 -------------------------------------------------------------------------------------


def test_tc_22_2_a_curated_ref_gives_a_team_curated_claim_with_the_passage(curated: Api) -> None:
    claim = steroid_claim(curated.approved().report().json())
    assert claim["status"] == "TEAM_CURATED"
    citation = claim["citation"]
    assert citation["passage_id"] == PASSAGE_ID
    assert citation["excerpt"] == EXCERPT
    assert citation["title"] and citation["locator"] and citation["url"] and citation["license"]
    assert citation["review_status"] == "TEAM_CURATED"
    assert citation["review_note"] == "Team-selected source, not reviewed by a clinician"


@pytest.mark.parametrize(
    "variant",
    [
        {"ref_passage_id": "TEST-SOURCE:missing:9999"},
        {"excerpt_hash": "0" * 64},
        {"ref_hash": "f" * 64},
    ],
    ids=["missing-passage", "tampered-excerpt", "ref-hash-differs"],
)
def test_tc_22_2_a_broken_ref_stays_insufficient_evidence(
    tmp_path: Path, variant: dict[str, str]
) -> None:
    for api in build_api(tmp_path, make_root(tmp_path, **variant)):
        claim = steroid_claim(api.approved().report().json())
        assert claim["status"] == "INSUFFICIENT_EVIDENCE"
        assert claim["citation"] is None


# TC-22.3 -------------------------------------------------------------------------------------


def test_tc_22_3_team_curated_is_never_shown_as_verified(curated: Api) -> None:
    report = curated.approved().report().json()
    claim = steroid_claim(report)
    assert claim["status"] not in {"SUPPORTED", "VERIFIED"}
    assert "VERIFIED" not in json.dumps(claim)
    assert "NO_VERIFIED_EVIDENCE" in {limit["code"] for limit in report["limits"]}


# TC-22.4 -------------------------------------------------------------------------------------


def test_tc_22_4_the_emergency_modules_import_no_passage_or_explanation_code() -> None:
    package = REPO_ROOT / "apps" / "api" / "sanad_api"
    for module in ("rules_engine/emergency.py", "rules_engine/emergency_text.py"):
        tree = ast.parse((package / module).read_text(encoding="utf-8"))
        imported = {
            node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)
        } | {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        }
        assert not any("report_explain" in name or "reports" in name for name in imported)
        assert "passages" not in (package / module).read_text(encoding="utf-8")
    page = (REPO_ROOT / "apps" / "web" / "public" / "urgent.html").read_text(encoding="utf-8")
    assert "passage" not in page and "explanation" not in page


# TC-22.5 -------------------------------------------------------------------------------------


def test_tc_22_5_explanation_needs_a_released_report(curated: Api, fake: FakeAdapter) -> None:
    patient = curated.pending()
    response = explain(patient)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "REPORT_NOT_RELEASED"
    assert fake.calls == []
    anonymous = curated.anonymous().post(patient.path("/report/explanation"))
    assert anonymous.status_code == 401


def test_tc_22_5_explanation_changes_nothing_in_the_case(curated: Api, fake: FakeAdapter) -> None:
    patient = curated.approved()
    before_state = patient.state()
    before_report = patient.report().json()
    fake.replies.append(GOOD)
    assert explain(patient).json()["outcome"] == "AI_DRAFT"
    after_state = patient.state()
    assert after_state["case_version"] == before_state["case_version"]
    assert after_state["state"] == before_state["state"]
    assert patient.report().json() == before_report


# TC-22.6 -------------------------------------------------------------------------------------


def test_tc_22_6_the_model_request_holds_codes_and_passages_only(
    curated: Api, fake: FakeAdapter
) -> None:
    patient = curated.approved()
    fake.replies.append(GOOD)
    explain(patient)
    request = fake.calls[0]
    payload = json.loads(request.user_content)
    assert set(payload) == {"next_step", "signals", "passages"}
    assert payload["signals"] == [SIGNAL]
    assert payload["passages"] == [{"passage_id": PASSAGE_ID, "excerpt": EXCERPT}]
    assert patient.token and patient.token not in request.user_content
    assert patient.case_id not in request.user_content
    assert request.envelope.task_id == "report.explain.v1"


# TC-22.7 -------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        ModelResult(ModelStatus.OK, "not json", 1, 5),
        reply(("A specialist may help.", ["TEST-SOURCE:invented:1"])),
        reply(("A specialist may help.", [])),
        reply(("This is not a diagnosis of anything.", [PASSAGE_ID])),
        reply(("Infertility is not implied.", [PASSAGE_ID])),
        reply(("About 30% of men see a specialist.", [PASSAGE_ID])),
        reply(("This does not mean you cannot have children.", [PASSAGE_ID])),
        reply(("Please go to the emergency department.", [PASSAGE_ID])),
        reply(("A primary care visit is enough.", [PASSAGE_ID])),
        reply(*[("A specialist may help.", [PASSAGE_ID])] * 4),
        reply(("x" * 281, [PASSAGE_ID])),
        reply(status="EXPLAINED"),
    ],
    ids=[
        "not-json",
        "unknown-passage",
        "no-passage",
        "diagnosis",
        "infertility",
        "percentage",
        "cannot-have-children",
        "other-step-emergency",
        "other-step-primary-care",
        "too-many-sentences",
        "too-long",
        "no-sentences",
    ],
)
def test_tc_22_7_invalid_model_output_falls_back(
    curated: Api, fake: FakeAdapter, bad: ModelResult, request: pytest.FixtureRequest
) -> None:
    patient = curated.approved()
    fake.replies.append(bad)
    body = explain(patient).json()
    assert body["outcome"] == "FALLBACK"
    # AC-22.11: wording and wrong-step blocks are policy blocks, counted apart from schema faults.
    policy = {"diagnosis", "infertility", "percentage", "cannot-have-children",
              "other-step-emergency", "other-step-primary-care"}
    case_id = request.node.callspec.id
    expected = "OUTPUT_POLICY_BLOCKED" if case_id in policy else "MODEL_OUTPUT_INVALID"
    assert body["reason_code"] == expected
    assert body["sentences"] == []
    assert body["fallback_text"] == patient.report().json()["why_next_step"]


# TC-22.8 -------------------------------------------------------------------------------------


def test_tc_22_8_no_curated_passage_falls_back_without_a_model_call(
    tmp_path: Path, fake: FakeAdapter
) -> None:
    for api in build_api(tmp_path, REPO_ROOT, fake):
        body = explain(api.approved()).json()
        assert body["outcome"] == "FALLBACK"
        assert body["reason_code"] == "NO_CURATED_PASSAGES"
        assert fake.calls == []


def test_tc_22_8_a_reviewer_edit_falls_back_without_a_model_call(
    curated: Api, fake: FakeAdapter
) -> None:
    patient = curated.pending()
    curated.decide(patient, "EDIT", edits={"triage_action": "PRIORITY_REVIEW"})
    assert curated.decide(patient, "APPROVE").status_code == 200
    body = explain(patient).json()
    assert body["reason_code"] == "REVIEWER_EDITED"
    assert body["fallback_text"] == "A simulated reviewer changed the suggested next step."
    assert fake.calls == []


@pytest.mark.parametrize(
    ("outcome", "code"),
    [
        (ModelResult(ModelStatus.TIMEOUT, None, 2, 12_000, "TIMEOUT"), "MODEL_UNAVAILABLE"),
        (RuntimeError("adapter bug"), "MODEL_UNAVAILABLE"),
        (ModelResult(ModelStatus.CONTENT_FILTERED, None, 1, 5), "MODEL_CONTENT_FILTERED"),
        (ModelResult(ModelStatus.REFUSED, None, 1, 5), "MODEL_REFUSED"),
        (reply(status="ABSTAIN"), "ABSTAIN"),
    ],
    ids=["timeout", "exception", "filtered", "refused", "abstain"],
)
def test_tc_22_8_model_failures_fall_back_with_a_reason(
    curated: Api, fake: FakeAdapter, outcome: Any, code: str
) -> None:
    patient = curated.approved()
    fake.replies.append(outcome)
    response = explain(patient)
    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "FALLBACK" and body["reason_code"] == code
    assert body["label"] is None and body["produced_by"] is None


# TC-22.9 -------------------------------------------------------------------------------------


def test_tc_22_9_a_valid_reply_is_a_labelled_ai_draft_with_a_code_only_trace(
    curated: Api, fake: FakeAdapter
) -> None:
    patient = curated.approved()
    fake.replies.append(GOOD)
    body = explain(patient).json()
    assert body["outcome"] == "AI_DRAFT" and body["reason_code"] is None
    assert body["label"] == "AI draft — Mock review"
    assert body["sentences"][0]["passage_ids"] == [PASSAGE_ID]
    assert body["citations"][0]["passage_id"] == PASSAGE_ID
    assert body["produced_by"] == {
        "provider": "fake",
        "model_id": "fake-model-1",
        "label": "Fake model (tests)",
        "is_ai_generated": True,
        "verification_status": "UNVERIFIED",
    }
    traces = [
        event for event in curated.audit(patient.case_id) if event.event_type == "MODEL_TASK_RUN"
    ]
    assert len(traces) == 1
    details = json.loads(traces[0].details_json)
    assert details["task_id"] == "report.explain.v1"
    assert details["outcome"] == "AI_DRAFT"
    assert "Steroid use" not in traces[0].details_json
    assert EXCERPT not in traces[0].details_json


# TC-22.10 ------------------------------------------------------------------------------------


def test_tc_22_10_default_settings_make_no_model_call(tmp_path: Path) -> None:
    for api in build_api(tmp_path, make_root(tmp_path)):
        body = explain(api.approved()).json()
        assert body["outcome"] == "FALLBACK"
        assert body["reason_code"] == "MODEL_DISABLED"
        assert api.app.state.model_adapter.provider == "disabled"
