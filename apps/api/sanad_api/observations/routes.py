"""Lab observation endpoints (API design section 6.10)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt
from sqlalchemy.orm import Session

from sanad_api.cases.guards import Action, PatientCase, guard
from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.deps import get_catalogues, get_clock, get_db
from sanad_api.errors import ApiError, ErrorCode
from sanad_api.observations import service
from sanad_api.observations.models import Observation
from sanad_api.schemas import ObservationOut
from sanad_api.vocab import SourceType

router = APIRouter(tags=["observations"])


class ObservationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    test_code: str = Field(max_length=48)
    value: StrictFloat | StrictInt | None = None
    unit: str | None = Field(default=None, max_length=16)
    collected_on: str | None = Field(default=None, max_length=32)
    reference_source: str | None = Field(default=None, max_length=64)

    def fields(self, catalogues: Catalogues) -> service.ObservationFields:
        if self.test_code not in catalogues.lab_tests.tests:
            raise ApiError(422, ErrorCode.VALIDATION_FAILED, ["UNKNOWN_TEST_CODE"])
        return service.ObservationFields(
            test_code=self.test_code,
            value=None if self.value is None else float(self.value),
            unit=self.unit,
            collected_on=self.collected_on,
            reference_source=self.reference_source,
        )


class ObservationListOut(BaseModel):
    observations: list[ObservationOut]


def _owned(db: Session, pc: PatientCase, observation_id: str) -> Observation:
    row = db.query(Observation).filter(Observation.observation_id == observation_id).first()
    if row is None or row.case_id != pc.case.case_id:
        raise ApiError(404, ErrorCode.NOT_FOUND)
    return row


@router.get("/cases/{case_id}/observations", response_model=ObservationListOut)
def list_observations(
    pc: PatientCase = Depends(guard(Action.ENTER_OBSERVATION)),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = service.for_case(db, pc.case.case_id)
    return {"observations": [service.observation_out(row) for row in rows]}


@router.post("/cases/{case_id}/observations", status_code=201, response_model=ObservationOut)
def create_observation(
    body: ObservationIn,
    pc: PatientCase = Depends(guard(Action.ENTER_OBSERVATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    """Held at NEEDS_USER_CONFIRMATION. A bad unit or date is listed, not refused (AC-15.2)."""
    row = service.create(
        db,
        pc.case.case_id,
        body.fields(catalogues),
        SourceType.USER_ENTERED,
        catalogues.lab_tests,
        clock.now(),
    )
    db.commit()
    return service.observation_out(row)


@router.put("/cases/{case_id}/observations/{observation_id}", response_model=ObservationOut)
def replace_observation(
    observation_id: str,
    body: ObservationIn,
    pc: PatientCase = Depends(guard(Action.ENTER_OBSERVATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    row = _owned(db, pc, observation_id)
    service.replace(db, pc.case, row, body.fields(catalogues), catalogues.lab_tests, clock.now())
    db.commit()
    return service.observation_out(row)


@router.delete("/cases/{case_id}/observations/{observation_id}", status_code=204)
def delete_observation(
    observation_id: str,
    pc: PatientCase = Depends(guard(Action.ENTER_OBSERVATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
) -> Response:
    service.remove(db, pc.case, _owned(db, pc, observation_id), clock.now())
    db.commit()
    return Response(status_code=204)


@router.post(
    "/cases/{case_id}/observations/{observation_id}/confirm", response_model=ObservationOut
)
def confirm_observation(
    observation_id: str,
    pc: PatientCase = Depends(guard(Action.ENTER_OBSERVATION)),
    db: Session = Depends(get_db),
    clock: Clock = Depends(get_clock),
    catalogues: Catalogues = Depends(get_catalogues),
) -> dict[str, Any]:
    row = _owned(db, pc, observation_id)
    issues = service.issues_of(row)
    if issues:
        raise ApiError(422, ErrorCode.OBSERVATION_INVALID, issues)
    if not service.is_confirmed(row):
        service.confirm(db, pc.case, row, catalogues, clock.now())
        db.commit()
    return service.observation_out(row)
