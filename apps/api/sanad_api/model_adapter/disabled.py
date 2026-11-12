"""The default adapter. It never touches the network, so the API runs with no model configured
(INV-01, PRD-AC-17, NFR-09)."""

from __future__ import annotations

from sanad_api.model_adapter.port import ModelRequest, ModelResult, ModelStatus


class DisabledAdapter:
    provider = "disabled"
    model_id = "none"
    label = "No model configured"

    @property
    def enabled(self) -> bool:
        return False

    def complete_json(self, request: ModelRequest) -> ModelResult:
        return ModelResult(ModelStatus.DISABLED, None, attempts=0, elapsed_ms=0)
