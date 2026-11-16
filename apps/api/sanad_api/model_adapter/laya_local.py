"""Local decision-model adapter (RF-25, T4.9, CC-015). Optional: install the `decision` extra.

Laya (Convai Innovations) answers typed questions (`choice`, `score`, `noul`) with probabilities
in one forward pass and writes no text. This adapter serves `intake.extract.v1` only, for yes/no
and choice questions: it turns the question into one `choice` whose labels come from the
catalogue, runs it on this host, and returns the same JSON a generative provider would. The
unchanged RF-21 validator then checks it, and the user confirms it before anything is saved.

Typed text never leaves the host for this provider. Weights load once at start-up from the local
Hugging Face cache at a pinned revision; no request downloads anything (AC-25.2).
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any

from sanad_api.model_adapter import intake_extract
from sanad_api.model_adapter.port import ModelRequest, ModelResult, ModelStatus

logger = logging.getLogger("sanad.model")

LABEL = "Laya (local model on this server)"
OPT_OUTS = {
    "NOT_SURE": "The person says they do not know or are not sure.",
    "PREFER_NOT_TO_ANSWER": "The person does not want to answer.",
    "NOT_AN_ANSWER": "The message does not answer this question.",
}


def _draft(
    status: str,
    choice: str | None = None,
    value: Any = None,
    temporal: str | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    return {
        "status": status,
        "choice": choice,
        "value": value,
        "temporal_status": temporal,
        "abstain_reason": reason,
    }


def labels_for(question: dict[str, Any]) -> dict[str, tuple[str, dict[str, Any]]]:
    """Label -> (description shown to the model, the intake draft it stands for).

    Descriptions repeat catalogue wording only (AC-25.4)."""
    text = question["text"]
    labels: dict[str, tuple[str, dict[str, Any]]] = {}
    options = question["options"]
    times = {t["value"]: t["label"] for t in question["time_options"]}
    for option in options:
        value, label = option["value"], option["label"]
        if value is True and times:
            for code in ("CURRENT", "PAST"):
                labels[f"YES_{code}"] = (
                    f"Answer to '{text}': {label}, {times.get(code, code.lower())}.",
                    _draft("PROPOSED", "ANSWERED", True, code),
                )
            labels["YES_TIME_UNCLEAR"] = (
                f"Answer to '{text}': {label}, but it does not say whether now or in the past.",
                _draft("ABSTAIN", reason="UNCLEAR"),
            )
        else:
            key = "NO" if value is False else ("YES" if value is True else str(value))
            labels[key] = (f"Answer to '{text}': {label}.", _draft("PROPOSED", "ANSWERED", value))
    for code, description in OPT_OUTS.items():
        draft = (
            _draft("ABSTAIN", reason="OUT_OF_SCOPE")
            if code == "NOT_AN_ANSWER"
            else _draft("PROPOSED", code)
        )
        labels[code] = (description, draft)
    return labels


def decision_key(question: dict[str, Any]) -> str:
    """AC-25.11: questions with the same label set share one fitted head."""
    if question["answer_type"] == "yes_no":
        return "YN_TIME" if question["time_options"] else "YN"
    return "CHOICE:" + "|".join(str(o["value"]) for o in question["options"])


def decision_question(
    question: dict[str, Any],
) -> tuple[str, dict[str, Any], dict[str, tuple[str, dict[str, Any]]]]:
    """(key, the laya `choice` question, labels). The fit script builds rows with this too, so
    a head is fitted on exactly the prompt it later serves."""
    labels = labels_for(question)
    spec = {
        "type": "choice",
        "instructions": f"Which answer does this message give to the question: {question['text']}",
        "criteria": {key: description for key, (description, _) in labels.items()},
    }
    return decision_key(question), spec, labels


class LayaLocalAdapter:
    provider = "laya_local"
    label = LABEL

    def __init__(
        self,
        agent: Any,
        model: str,
        revision: str,
        *,
        min_prob: float,
        monotonic: Any = time.monotonic,
    ) -> None:
        self._agent = agent
        # Audit fields hold codes only, so the Hub id becomes `org:name:revision12`.
        self.model_id = f"{model.replace('/', ':')}:{revision[:12]}"
        self._min_prob = min_prob
        self._monotonic = monotonic
        # One worker: the model is not shared across threads, and a request that overruns its
        # deadline must not start another inference behind it.
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="laya")

    @property
    def enabled(self) -> bool:
        return True

    def complete_json(self, request: ModelRequest) -> ModelResult:
        started = self._monotonic()
        if request.envelope.task_id != intake_extract.TASK_ID:
            return self._done(ModelStatus.UNAVAILABLE, started, "UNSUPPORTED_TASK", attempts=0)
        payload = json.loads(request.user_content)
        question = payload["question"]
        if question["answer_type"] not in ("yes_no", "choice") or not question["options"]:
            return self._done(ModelStatus.UNAVAILABLE, started, "UNSUPPORTED_TASK", attempts=0)

        key, spec, labels = decision_question(question)
        future = self._pool.submit(self._agent.predict, payload["message"], {key: spec})
        try:
            out = future.result(timeout=request.envelope.timeout_ms / 1000)
        except FutureTimeout:
            return self._done(ModelStatus.TIMEOUT, started, "TIMEOUT")
        except Exception as error:  # a local model failure means "no model result"
            logger.error("local model failed: %s", type(error).__name__)
            return self._done(ModelStatus.UNAVAILABLE, started, "LOCAL_MODEL_ERROR")

        draft = self._decide(out.get("answers", {}).get(key) or {}, labels)
        return ModelResult(
            ModelStatus.OK,
            json.dumps(draft),
            attempts=1,
            elapsed_ms=self._elapsed(started),
        )

    def _decide(
        self, answer: dict[str, Any], labels: dict[str, tuple[str, dict[str, Any]]]
    ) -> dict[str, Any]:
        """AC-25.5. Anything uncertain becomes ABSTAIN; the confidence field is not trusted."""
        unclear = _draft("ABSTAIN", reason="UNCLEAR")
        top = answer.get("choice")
        if top not in labels:
            return unclear
        if answer.get("calibrated") is False:  # an option the fitted policy never saw
            return unclear
        if answer.get("abstain") is True or answer.get("unbound") is True:
            return unclear
        if answer.get("route") == "review":
            return unclear
        prediction_set = answer.get("prediction_set")
        if isinstance(prediction_set, list) and len(prediction_set) > 1:
            return unclear
        probability = (answer.get("probabilities") or {}).get(top)
        if not isinstance(probability, int | float) or probability < self._min_prob:
            return unclear
        return labels[top][1]

    def _done(
        self, status: ModelStatus, started: float, code: str, attempts: int = 1
    ) -> ModelResult:
        return ModelResult(status, None, attempts, self._elapsed(started), code)

    def _elapsed(self, started: float) -> int:
        return max(0, int((self._monotonic() - started) * 1000))
