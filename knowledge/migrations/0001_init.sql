-- Run once as a PostgreSQL administrator against a dedicated sanad_knowledge database.
-- The case database and any patient data must never be placed in this database.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE ROLE knowledge_owner NOLOGIN;
CREATE ROLE knowledge_reader NOLOGIN;
CREATE ROLE knowledge_ingest NOLOGIN;

-- Login passwords are provisioned outside git by the database operator.
CREATE ROLE sanad_kn_mcp LOGIN IN ROLE knowledge_reader;
CREATE ROLE sanad_kn_verifier LOGIN IN ROLE knowledge_reader;
CREATE ROLE sanad_kn_ingest LOGIN IN ROLE knowledge_ingest;

ALTER ROLE sanad_kn_mcp SET default_transaction_read_only = on;
ALTER ROLE sanad_kn_verifier SET default_transaction_read_only = on;

REVOKE ALL ON DATABASE sanad_knowledge FROM PUBLIC;
GRANT CONNECT ON DATABASE sanad_knowledge TO knowledge_reader, knowledge_ingest;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA knowledge AUTHORIZATION knowledge_owner;
GRANT USAGE ON SCHEMA knowledge TO knowledge_reader, knowledge_ingest;

ALTER DEFAULT PRIVILEGES FOR ROLE knowledge_owner IN SCHEMA knowledge
    GRANT SELECT ON TABLES TO knowledge_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE knowledge_owner IN SCHEMA knowledge
    GRANT SELECT, INSERT, UPDATE ON TABLES TO knowledge_ingest;

SET ROLE knowledge_owner;

CREATE TABLE knowledge.source (
    source_id        text        NOT NULL,
    source_version   text        NOT NULL,
    title            text        NOT NULL,
    publisher        text        NOT NULL,
    jurisdiction     text        NOT NULL,
    language         text        NOT NULL CHECK (language IN ('en', 'ar')),
    license          text        NOT NULL,
    allowed_use      text[]      NOT NULL,
    review_status    text        NOT NULL CHECK (review_status IN
                         ('PENDING', 'APPROVED', 'REJECTED', 'RETIRED', 'SYNTHETIC_TEST_ONLY')),
    reviewed_by_role text,
    reviewed_at      timestamptz,
    valid_from       date,
    valid_to         date,
    last_checked     date        NOT NULL,
    source_url       text,
    document_sha256  text        NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
    manifest_version text        NOT NULL,
    PRIMARY KEY (source_id, source_version),
    CHECK (review_status <> 'APPROVED' OR (reviewed_by_role IS NOT NULL AND reviewed_at IS NOT NULL)),
    CHECK (allowed_use <@ ARRAY['CLINICIAN_DRAFT', 'PATIENT_EDUCATION', 'QA_TEST']::text[])
);

CREATE TABLE knowledge.index_build (
    index_version      text        PRIMARY KEY,
    manifest_version   text        NOT NULL,
    embedding_model_id text        NOT NULL,
    embedding_dim      integer     NOT NULL CHECK (embedding_dim > 0),
    chunker_version    text        NOT NULL,
    built_at           timestamptz NOT NULL,
    source_count       integer     NOT NULL CHECK (source_count >= 0),
    chunk_count        integer     NOT NULL CHECK (chunk_count >= 0),
    status             text        NOT NULL CHECK (status IN ('BUILDING', 'ACTIVE', 'RETIRED'))
);
CREATE UNIQUE INDEX one_active_index ON knowledge.index_build (status) WHERE status = 'ACTIVE';

CREATE TABLE knowledge.chunk (
    index_version    text    NOT NULL REFERENCES knowledge.index_build,
    chunk_id         text    NOT NULL,
    source_id        text    NOT NULL,
    source_version   text    NOT NULL,
    citation_locator text    NOT NULL,
    topic_codes      text[]  NOT NULL,
    language         text    NOT NULL CHECK (language IN ('en', 'ar')),
    content          text    NOT NULL,
    content_sha256   text    NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    token_count      integer NOT NULL CHECK (token_count > 0),
    embedding        vector  NOT NULL,
    PRIMARY KEY (index_version, chunk_id),
    FOREIGN KEY (source_id, source_version) REFERENCES knowledge.source
);
CREATE INDEX chunk_topics_idx ON knowledge.chunk USING gin (topic_codes);
CREATE INDEX chunk_source_idx ON knowledge.chunk (source_id, source_version);

CREATE TABLE knowledge.topic_query (
    index_version text   NOT NULL REFERENCES knowledge.index_build,
    topic_code    text   NOT NULL,
    query_text    text   NOT NULL,
    embedding     vector NOT NULL,
    PRIMARY KEY (index_version, topic_code)
);

RESET ROLE;

-- Assign passwords to the three login roles through the deploy-time secret store. Searches and
-- citation checks connect as sanad_kn_mcp / sanad_kn_verifier, never as an owner or admin.
