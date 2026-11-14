"""Read-only access to the separate PostgreSQL knowledge database.

This module accepts only fixed topic codes and metadata identifiers. It never accepts free text,
case data, patient tokens, or a query vector from a caller.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Any, AsyncIterator

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

TOPIC_CODES = frozenset(
    {
        "BMI_BODY_COMPOSITION",
        "ANABOLIC_STEROID_USE",
        "SEMEN_ANALYSIS_REFERENCE_LIMITS",
        "SEMEN_ANALYSIS_NO_SPERM",
    }
)
PURPOSES = frozenset({"CLINICIAN_DRAFT", "PATIENT_EDUCATION"})
LANGUAGES = frozenset({"en", "ar"})
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_EXCERPT_LENGTH = 1200


class KnowledgeStore:
    """Stateless, read-only knowledge queries using a dedicated login role."""

    def __init__(
        self,
        *,
        dsn: str | None = None,
        embedding_model_id: str | None = None,
        max_distance: float | None = None,
        timeout_ms: int | None = None,
    ) -> None:
        self.dsn = dsn if dsn is not None else os.environ.get("SANAD_KNOWLEDGE_DATABASE_URL")
        self.embedding_model_id = (
            embedding_model_id
            if embedding_model_id is not None
            else os.environ.get("SANAD_EMBEDDING_MODEL_ID")
        )
        self.max_distance = max_distance if max_distance is not None else self._distance_from_env()
        self.timeout_ms = timeout_ms if timeout_ms is not None else self._timeout_from_env()
        (
            self.manifest_version,
            self.manifest_sources,
            self.manifest_valid,
            self.manifest_approved,
        ) = (
            self._load_source_manifest()
        )

    @staticmethod
    def _load_source_manifest() -> tuple[
        str | None, tuple[dict[str, Any], ...], bool, bool
    ]:
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / "knowledge" / "manifests" / "sources.v0.1.json"
        if not path.exists():
            path = Path(__file__).resolve().parent / "data" / "sources.v0.1.json"
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(manifest, dict):
                return None, (), False, False
            version = manifest.get("manifest_version")
            sources = manifest.get("sources")
            if (
                not isinstance(version, str)
                or not version
                or not isinstance(sources, list)
                or len(sources) > 500
                or not isinstance(manifest.get("status"), str)
                or manifest["status"] not in {"PROPOSED", "APPROVED"}
            ):
                return None, (), False, False
            parsed: list[dict[str, Any]] = []
            seen: set[tuple[str, str]] = set()
            for source in sources:
                if not isinstance(source, dict):
                    return None, (), False, False
                source_id = source.get("source_id")
                source_version = source.get("source_version")
                if (
                    not isinstance(source_id, str)
                    or not source_id
                    or not isinstance(source_version, str)
                    or not source_version
                ):
                    return None, (), False, False
                pair = (source_id, source_version)
                if pair in seen:
                    return None, (), False, False
                if any(
                    field not in source
                    for field in (
                        "title",
                        "publisher",
                        "jurisdiction",
                        "language",
                        "license",
                        "allowed_use",
                        "review_status",
                        "valid_from",
                        "valid_to",
                        "last_checked",
                        "source_url",
                        "document_sha256",
                    )
                ):
                    return None, (), False, False
                allowed_use = source.get("allowed_use")
                valid_from = source.get("valid_from")
                valid_to = source.get("valid_to")
                if (
                    not all(
                        isinstance(source.get(field), str) and source.get(field)
                        for field in ("title", "publisher", "jurisdiction", "license")
                    )
                    or not isinstance(source.get("language"), str)
                    or source["language"] not in LANGUAGES
                    or (valid_from is not None and not isinstance(valid_from, str))
                    or (valid_to is not None and not isinstance(valid_to, str))
                    or (
                        source.get("source_url") is not None
                        and not isinstance(source.get("source_url"), str)
                    )
                    or not isinstance(allowed_use, list)
                    or not allowed_use
                    or not all(isinstance(use, str) for use in allowed_use)
                    or not set(allowed_use).issubset(PURPOSES | {"QA_TEST"})
                    or not isinstance(source.get("document_sha256"), str)
                    or not SHA256_RE.fullmatch(source["document_sha256"])
                    or not isinstance(source.get("last_checked"), str)
                    or not isinstance(source.get("review_status"), str)
                    or source["review_status"] not in {
                        "PENDING",
                        "APPROVED",
                        "REJECTED",
                        "RETIRED",
                        "SYNTHETIC_TEST_ONLY",
                    }
                ):
                    return None, (), False, False
                if source["review_status"] == "APPROVED" and not (
                    isinstance(source.get("reviewed_by_role"), str)
                    and source.get("reviewed_by_role")
                    and isinstance(source.get("reviewed_at"), str)
                    and source.get("reviewed_at")
                ):
                    return None, (), False, False
                try:
                    date.fromisoformat(source["last_checked"])
                    if valid_from is not None:
                        date.fromisoformat(valid_from)
                    if valid_to is not None:
                        date.fromisoformat(valid_to)
                except ValueError:
                    return None, (), False, False
                seen.add(pair)
                parsed.append(source)
            return (
                version,
                tuple(parsed),
                True,
                manifest.get("status") == "APPROVED",
            )
        except (OSError, ValueError):
            return None, (), False, False

    @staticmethod
    def _timeout_from_env() -> int:
        raw = os.environ.get("SANAD_KNOWLEDGE_TIMEOUT_MS", "3000")
        try:
            parsed = int(raw)
        except ValueError:
            return 3000
        return parsed if 100 <= parsed <= 60_000 else 3000

    @staticmethod
    def _distance_from_env() -> float | None:
        raw = os.environ.get("SANAD_KNOWLEDGE_MAX_DISTANCE")
        if raw is None:
            return None
        try:
            parsed = float(raw)
        except ValueError:
            return None
        return parsed if 0.0 <= parsed <= 2.0 else None

    @property
    def configured_for_search(self) -> bool:
        return bool(
            self.manifest_valid
            and self.dsn
            and self.embedding_model_id
            and self.max_distance is not None
        )

    @property
    def approved_manifest_pairs(self) -> tuple[tuple[str, str], ...]:
        if not self.manifest_approved:
            return ()
        return tuple(
            sorted(
                (source["source_id"], source["source_version"])
                for source in self.manifest_sources
                if source.get("review_status") == "APPROVED"
            )
        )

    def source_is_in_manifest(self, source_id: str, source_version: str) -> bool:
        return any(
            source.get("source_id") == source_id
            and source.get("source_version") == source_version
            for source in self.manifest_sources
        )

    def source_is_approved_in_manifest(self, source_id: str, source_version: str) -> bool:
        return self.manifest_approved and any(
            source.get("source_id") == source_id
            and source.get("source_version") == source_version
            and source.get("review_status") == "APPROVED"
            for source in self.manifest_sources
        )

    @staticmethod
    def _source_matches_manifest(source: dict[str, Any], stored: dict[str, Any]) -> bool:
        fields = (
            "title",
            "publisher",
            "jurisdiction",
            "language",
            "license",
            "allowed_use",
            "review_status",
            "valid_from",
            "valid_to",
            "last_checked",
            "source_url",
            "document_sha256",
        )
        if any(field not in source or field not in stored for field in fields):
            return False
        if any(source[field] != stored[field] for field in fields if field != "allowed_use"):
            return False
        if set(source["allowed_use"]) != set(stored["allowed_use"]):
            return False
        if source.get("reviewed_by_role") != stored.get("reviewed_by_role"):
            return False
        return True

    @asynccontextmanager
    async def _connection(self) -> AsyncIterator[psycopg.AsyncConnection[Any]]:
        if not self.dsn:
            raise RuntimeError("knowledge database is not configured")
        connection_options = conninfo_to_dict(self.dsn)
        if (
            connection_options.get("dbname") != "sanad_knowledge"
            or connection_options.get("user") != "sanad_kn_mcp"
        ):
            raise RuntimeError("knowledge MCP requires its dedicated read-only database login")
        async with await psycopg.AsyncConnection.connect(
            self.dsn,
            connect_timeout=max(1, (self.timeout_ms + 999) // 1000),
            options=(
                "-c default_transaction_read_only=on "
                f"-c statement_timeout={self.timeout_ms}"
            ),
            row_factory=dict_row,
        ) as connection:
            yield connection

    @staticmethod
    def _unavailable_search() -> dict[str, Any]:
        return {
            "status": "KNOWLEDGE_UNAVAILABLE",
            "index_version": None,
            "manifest_version": None,
            "topic_results": [],
            "passages": [],
        }

    async def search_evidence(
        self,
        *,
        topic_codes: list[str],
        purpose: str,
        language: str,
        max_results: int,
    ) -> dict[str, Any]:
        if not self.configured_for_search:
            return self._unavailable_search()
        approved_pairs = self.approved_manifest_pairs
        if not approved_pairs:
            return {
                "status": "NO_GROUNDED_EVIDENCE",
                "index_version": None,
                "manifest_version": self.manifest_version,
                "topic_results": [
                    {
                        "topic_code": topic,
                        "status": "NO_GROUNDED_EVIDENCE",
                        "chunk_ids": [],
                    }
                    for topic in sorted(topic_codes)
                ],
                "passages": [],
            }
        try:
            async with self._connection() as connection:
                # A topic search spans several statements and must keep one active-index view.
                await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
                async with connection.cursor() as cursor:
                    as_of = date.today()
                    await cursor.execute(
                        """
                        SELECT index_version, manifest_version, embedding_model_id
                        FROM knowledge.index_build
                        WHERE status = 'ACTIVE'
                        """
                    )
                    active = await cursor.fetchone()
                    if active is None:
                        return {
                            "status": "NO_GROUNDED_EVIDENCE",
                            "index_version": None,
                            "manifest_version": None,
                            "topic_results": [
                                {
                                    "topic_code": topic,
                                    "status": "NO_GROUNDED_EVIDENCE",
                                    "chunk_ids": [],
                                }
                                for topic in sorted(topic_codes)
                            ],
                            "passages": [],
                        }
                    if active["manifest_version"] != self.manifest_version:
                        return self._unavailable_search()
                    if active["embedding_model_id"] != self.embedding_model_id:
                        return {
                            "status": "MODEL_MISMATCH",
                            "index_version": None,
                            "manifest_version": None,
                            "topic_results": [],
                            "passages": [],
                        }

                    by_topic: dict[str, list[dict[str, Any]]] = {}
                    manifest_values = ", ".join("(%s, %s)" for _ in approved_pairs)
                    for topic in sorted(topic_codes):
                        await cursor.execute(
                            f"""
                            SELECT c.chunk_id, c.source_id, c.source_version,
                                   c.citation_locator, c.content, c.content_sha256,
                                   to_jsonb(s) AS source_metadata,
                                   c.embedding <=> q.embedding AS distance
                            FROM knowledge.index_build AS b
                            JOIN knowledge.topic_query AS q
                              ON q.index_version = b.index_version AND q.topic_code = %s
                            JOIN knowledge.chunk AS c
                              ON c.index_version = b.index_version
                             AND %s = ANY (c.topic_codes)
                            JOIN knowledge.source AS s
                              ON s.source_id = c.source_id
                             AND s.source_version = c.source_version
                            WHERE b.status = 'ACTIVE'
                              AND b.index_version = %s
                              AND s.review_status = 'APPROVED'
                              AND (s.source_id, s.source_version) IN (VALUES {manifest_values})
                              AND s.manifest_version = b.manifest_version
                              AND %s = ANY (s.allowed_use)
                              AND c.language = %s
                              AND c.language = s.language
                              AND (s.valid_from IS NULL OR s.valid_from <= %s)
                              AND (s.valid_to IS NULL OR s.valid_to >= %s)
                              AND (c.embedding <=> q.embedding) <= %s
                            ORDER BY distance, c.chunk_id
                            LIMIT %s
                            """,
                            (
                                topic,
                                topic,
                                active["index_version"],
                                *[value for pair in approved_pairs for value in pair],
                                purpose,
                                language,
                                as_of,
                                as_of,
                                self.max_distance,
                                max_results,
                            ),
                        )
                        by_topic[topic] = await cursor.fetchall()

            topic_results = [
                {
                    "topic_code": topic,
                    "status": "OK" if by_topic[topic] else "NO_GROUNDED_EVIDENCE",
                    "chunk_ids": [row["chunk_id"] for row in by_topic[topic]],
                }
                for topic in sorted(by_topic)
            ]
            unique_passages: dict[str, dict[str, Any]] = {}
            manifest_by_pair = {
                (source["source_id"], source["source_version"]): source
                for source in self.manifest_sources
            }
            for rows in by_topic.values():
                for row in rows:
                    manifest_source = manifest_by_pair.get(
                        (row["source_id"], row["source_version"])
                    )
                    if manifest_source is None or not self._source_matches_manifest(
                        manifest_source, row["source_metadata"]
                    ):
                        continue
                    content = row["content"]
                    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
                    if digest != row["content_sha256"]:
                        # Integrity failures are never passed to an authoring client as evidence.
                        continue
                    unique_passages[row["chunk_id"]] = {
                        "chunk_id": row["chunk_id"],
                        "source_id": row["source_id"],
                        "source_version": row["source_version"],
                        "citation_locator": row["citation_locator"],
                        "excerpt": content[:MAX_EXCERPT_LENGTH],
                        "content_sha256": digest,
                    }
            for result in topic_results:
                result["chunk_ids"] = [
                    chunk_id
                    for chunk_id in result["chunk_ids"]
                    if chunk_id in unique_passages
                ]
                if not result["chunk_ids"]:
                    result["status"] = "NO_GROUNDED_EVIDENCE"
            passages = [unique_passages[key] for key in sorted(unique_passages)]
            any_evidence = bool(passages)
            return {
                "status": "OK" if any_evidence else "NO_GROUNDED_EVIDENCE",
                "index_version": active["index_version"],
                "manifest_version": active["manifest_version"],
                "topic_results": topic_results,
                "passages": passages,
            }
        except Exception:
            # Do not log SQL, arguments, DSNs, source text, or driver error details.
            return self._unavailable_search()

    async def _active_passage_metadata(self, chunk_id: str) -> dict[str, Any] | None:
        async with self._connection() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    SELECT s.source_id, s.source_version, to_jsonb(s) AS source_metadata,
                           c.citation_locator, c.content_sha256,
                           b.manifest_version AS index_manifest_version,
                           s.manifest_version AS source_manifest_version
                    FROM knowledge.index_build AS b
                    JOIN knowledge.chunk AS c
                      ON c.index_version = b.index_version AND c.chunk_id = %s
                    JOIN knowledge.source AS s
                      ON s.source_id = c.source_id AND s.source_version = c.source_version
                    WHERE b.status = 'ACTIVE'
                    """,
                    (chunk_id,),
                )
                return await cursor.fetchone()

    async def _authorized_passage(
        self, chunk_id: str, purpose: str
    ) -> tuple[str, dict[str, Any] | None]:
        row = await self._active_passage_metadata(chunk_id)
        if row is None:
            return "CHUNK_NOT_FOUND", None
        if not self.manifest_valid:
            return "KNOWLEDGE_UNAVAILABLE", None
        if (
            not self.source_is_in_manifest(row["source_id"], row["source_version"])
            or row["index_manifest_version"] != self.manifest_version
            or row["source_manifest_version"] != self.manifest_version
        ):
            return "CHUNK_NOT_FOUND", None
        source = next(
            entry
            for entry in self.manifest_sources
            if entry.get("source_id") == row["source_id"]
            and entry.get("source_version") == row["source_version"]
        )
        if not self._source_matches_manifest(source, row["source_metadata"]):
            return "KNOWLEDGE_UNAVAILABLE", None
        stored_source = row["source_metadata"]
        if stored_source["review_status"] == "APPROVED" and not self.source_is_approved_in_manifest(
            row["source_id"], row["source_version"]
        ):
            return "SOURCE_NOT_APPROVED", None
        if stored_source["review_status"] == "SYNTHETIC_TEST_ONLY":
            return "SYNTHETIC_TEST_ONLY", None
        if stored_source["review_status"] != "APPROVED":
            return "SOURCE_NOT_APPROVED", None
        if purpose not in stored_source["allowed_use"]:
            return "USE_NOT_ALLOWED", None
        today = date.today()
        valid_from = stored_source["valid_from"]
        valid_to = stored_source["valid_to"]
        if (
            (valid_from is not None and date.fromisoformat(valid_from) > today)
            or (valid_to is not None and date.fromisoformat(valid_to) < today)
        ):
            return "SOURCE_EXPIRED", None
        return "OK", row

    async def get_passage(self, *, chunk_id: str, purpose: str) -> dict[str, Any]:
        try:
            status, row = await self._authorized_passage(chunk_id, purpose)
            if status != "OK" or row is None:
                return {"status": status, "passage": None}
            async with self._connection() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        SELECT c.content, c.content_sha256
                        FROM knowledge.index_build AS b
                        JOIN knowledge.chunk AS c
                          ON c.index_version = b.index_version AND c.chunk_id = %s
                        WHERE b.status = 'ACTIVE'
                        """,
                        (chunk_id,),
                    )
                    content_row = await cursor.fetchone()
            if content_row is None:
                return {"status": "CHUNK_NOT_FOUND", "passage": None}
            content = content_row["content"]
            digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
            if digest != content_row["content_sha256"] or digest != row["content_sha256"]:
                return {"status": "HASH_MISMATCH", "passage": None}
            return {
                "status": "OK",
                "passage": {
                    "chunk_id": chunk_id,
                    "source_id": row["source_id"],
                    "source_version": row["source_version"],
                    "citation_locator": row["citation_locator"],
                    "excerpt": content[:MAX_EXCERPT_LENGTH],
                    "content_sha256": digest,
                },
            }
        except Exception:
            return {"status": "KNOWLEDGE_UNAVAILABLE", "passage": None}

    async def get_source(self, *, source_id: str, source_version: str) -> dict[str, Any]:
        if not self.manifest_valid:
            return {"status": "KNOWLEDGE_UNAVAILABLE", "source": None}
        if not self.source_is_in_manifest(source_id, source_version):
            return {"status": "SOURCE_NOT_FOUND", "source": None}
        try:
            async with self._connection() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        SELECT to_jsonb(s) AS source_metadata
                        FROM knowledge.source AS s
                        WHERE s.source_id = %s AND s.source_version = %s
                          AND s.manifest_version = %s
                        """,
                        (source_id, source_version, self.manifest_version),
                    )
                    row = await cursor.fetchone()
            if row is None:
                return {"status": "SOURCE_NOT_FOUND", "source": None}
            stored_source = row["source_metadata"]
            manifest_source = next(
                entry
                for entry in self.manifest_sources
                if entry.get("source_id") == source_id
                and entry.get("source_version") == source_version
            )
            if not self._source_matches_manifest(manifest_source, stored_source):
                return {"status": "KNOWLEDGE_UNAVAILABLE", "source": None}
            return {
                "status": "OK",
                "source": {
                    field: stored_source.get(field)
                    for field in (
                        "source_id",
                        "source_version",
                        "title",
                        "publisher",
                        "jurisdiction",
                        "language",
                        "license",
                        "allowed_use",
                        "review_status",
                        "valid_from",
                        "valid_to",
                        "last_checked",
                        "source_url",
                        "document_sha256",
                        "manifest_version",
                    )
                },
            }
        except Exception:
            return {"status": "KNOWLEDGE_UNAVAILABLE", "source": None}

    async def verify_citation(
        self, *, chunk_id: str, content_sha256: str, purpose: str
    ) -> dict[str, str]:
        try:
            status, row = await self._authorized_passage(chunk_id, purpose)
            if status != "OK" or row is None:
                return {"status": status}
            if content_sha256 != row["content_sha256"]:
                return {"status": "HASH_MISMATCH"}
            async with self._connection() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        SELECT c.content
                        FROM knowledge.index_build AS b
                        JOIN knowledge.chunk AS c
                          ON c.index_version = b.index_version AND c.chunk_id = %s
                        WHERE b.status = 'ACTIVE'
                        """,
                        (chunk_id,),
                    )
                    content_row = await cursor.fetchone()
            if content_row is None:
                return {"status": "CHUNK_NOT_FOUND"}
            actual_hash = hashlib.sha256(content_row["content"].encode("utf-8")).hexdigest()
            return {"status": "VALID" if actual_hash == content_sha256 else "HASH_MISMATCH"}
        except Exception:
            return {"status": "KNOWLEDGE_UNAVAILABLE"}
