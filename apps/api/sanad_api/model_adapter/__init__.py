"""Bounded model adapter (PRD-FR-37, PRD 4.7.2, T4.5). Ports and adapters.

`port.ModelAdapter` is the only interface the rest of the API sees. Each adapter turns one
schema-bound task request into JSON text or a failure status, and nothing more. Prompts, schemas
and output validation belong to the task modules (`intake_extract`), so they stay the same
whichever provider runs.

Adapters:

- `disabled.DisabledAdapter`: the default. It makes no network call and always fails closed.
- `azure_openai.AzureOpenAIAdapter`: Azure OpenAI v1 API, through the `openai` SDK. It is used
  only when an operator sets `SANAD_MODEL_PROVIDER=azure_openai` (CC-011).

No model output is an action. The emergency rules, consent, case state and triage never call
an adapter, and a model result never writes a fact by itself (AGENTS.md rules 1 to 3).
"""
