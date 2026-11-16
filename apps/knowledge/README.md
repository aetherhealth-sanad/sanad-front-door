# Authoring knowledge MCP

`sanad-knowledge` is a local, stdio MCP server for authoring-time evidence work (Mode A). It has
four read-only tools for fixed-topic search, passage lookup, source metadata, and citation checks.
It has no model client and never accepts user free text, patient context, case tokens, or write
requests.

The tool definitions and schemas are pinned in
[`sanad_knowledge/tools.manifest.json`](sanad_knowledge/tools.manifest.json). The server checks the
manifest hash before starting and validates each request and structured result against its closed
JSON Schema. It serves only MCP revision `2026-07-28` through stdio.

## Local setup

From the repository root:

```bash
python3 -m venv apps/knowledge/.venv
apps/knowledge/.venv/bin/python -m pip install -e apps/knowledge
```

Configure these process environment variables through a local secret manager or shell:

- `SANAD_KNOWLEDGE_DATABASE_URL`: PostgreSQL connection to database `sanad_knowledge` as user
  `sanad_kn_mcp`. The connection is set read-only as well.
- `SANAD_EMBEDDING_MODEL_ID`: must match the active index build.
- `SANAD_KNOWLEDGE_MAX_DISTANCE`: evaluated cosine-distance cutoff, from `0.0` to `2.0`.
- `SANAD_KNOWLEDGE_TIMEOUT_MS`: optional statement timeout in milliseconds; defaults to `3000`.

Launch `apps/knowledge/.venv/bin/sanad-knowledge-mcp` from the repository. It remains attached to
stdin/stdout for the MCP host. Search returns `KNOWLEDGE_UNAVAILABLE` when required configuration
is missing or the database is unreachable. With no approved sources in the manifest it returns
`NO_GROUNDED_EVIDENCE` and no passage text.

## Separate knowledge database

`knowledge/migrations/0001_init.sql` is a one-time admin bootstrap for a dedicated PostgreSQL
database with pgvector. It creates owner, reader, and ingest roles plus the tables. Passwords are
set outside git. Do not run this against the API case database. There is currently no source
ingestion CLI, approved source, active index, or citation verifier wired into report rendering;
these remain separate work from the authoring MCP server.
