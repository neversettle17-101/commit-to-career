import os
import threading
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parents[2] / ".env")

_DATABASE_URL = os.environ["DATABASE_URL"]
_lock = threading.Lock()


def _connect() -> psycopg2.extensions.connection:
    conn = psycopg2.connect(_DATABASE_URL)
    conn.autocommit = False
    return conn


def _init() -> None:
    with _lock, _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    thread_id   TEXT PRIMARY KEY,
                    company     TEXT NOT NULL,
                    role        TEXT NOT NULL,
                    status      TEXT NOT NULL DEFAULT 'pending',
                    tags        TEXT[] NOT NULL DEFAULT '{}',
                    state_json  JSONB NOT NULL,
                    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_jobs_tags ON jobs USING GIN (tags)
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS profiles (
                    id           INTEGER PRIMARY KEY CHECK (id = 1),
                    profile_json JSONB NOT NULL,
                    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
        conn.commit()


# ── Jobs ──────────────────────────────────────────────────────────────────────

def upsert_job(thread_id: str, company: str, role: str, status: str, tags: list[str], state_json: str) -> None:
    with _lock, _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO jobs (thread_id, company, role, status, tags, state_json, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW())
                ON CONFLICT (thread_id) DO UPDATE SET
                    company    = EXCLUDED.company,
                    role       = EXCLUDED.role,
                    status     = EXCLUDED.status,
                    tags       = EXCLUDED.tags,
                    state_json = EXCLUDED.state_json,
                    updated_at = NOW()
                """,
                (thread_id, company, role, status, tags, state_json),
            )
        conn.commit()


def get_job(thread_id: str) -> str | None:
    with _lock, _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT state_json FROM jobs WHERE thread_id = %s",
                (thread_id,),
            )
            row = cur.fetchone()
    return psycopg2.extras.Json(row[0]) if row and row[0] else (str(row[0]) if row else None)


def get_all_successful_jobs() -> list[str]:
    with _lock, _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT state_json FROM jobs WHERE status!='error' ORDER BY updated_at DESC")
            rows = cur.fetchall()
    import json
    return [json.dumps(r["state_json"]) for r in rows]


def get_jobs_by_status(status: str) -> list[str]:
    """Query by the real status column — efficient indexed lookup."""
    with _lock, _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT state_json FROM jobs WHERE status = %s ORDER BY updated_at DESC",
                (status,),
            )
            rows = cur.fetchall()
    import json
    return [json.dumps(r["state_json"]) for r in rows]


def get_jobs_by_tag(tag: str) -> list[str]:
    """Query by tag using Postgres GIN index — e.g. get_jobs_by_tag('fintech')."""
    with _lock, _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT state_json FROM jobs WHERE tags @> %s ORDER BY updated_at DESC",
                ([tag],),
            )
            rows = cur.fetchall()
    import json
    return [json.dumps(r["state_json"]) for r in rows]


def update_job_status(thread_id: str, status: str, state_json: str) -> None:
    """Update status column + JSON blob together atomically."""
    with _lock, _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE jobs SET status = %s, state_json = %s::jsonb, updated_at = NOW()
                WHERE thread_id = %s
                """,
                (status, state_json, thread_id),
            )
        conn.commit()


# ── Profiles ──────────────────────────────────────────────────────────────────

def upsert_profile(profile_json: str) -> None:
    with _lock, _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO profiles (id, profile_json, updated_at)
                VALUES (1, %s::jsonb, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    profile_json = EXCLUDED.profile_json,
                    updated_at   = NOW()
                """,
                (profile_json,),
            )
        conn.commit()


def get_profile_json() -> str | None:
    with _lock, _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT profile_json FROM profiles WHERE id = 1")
            row = cur.fetchone()
    import json
    return json.dumps(row["profile_json"]) if row else None


_init()
