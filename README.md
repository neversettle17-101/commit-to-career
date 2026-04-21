# Commit to Career

Paste a company name and role — get a researched, personalized recruiter outreach message in seconds.

## Architecture

```
User Input (company + role)
        │
        ▼
  ┌─────────────┐        ┌──────────────────────────────────────────┐
  │  Next.js UI │──────▶ │              FastAPI Backend              │
  │  (port 3000)│◀────── │                                          │
  └─────────────┘  poll  │  load_resume → research → find_people   │
                         │                          → draft_message │
                         │                                          │
                         │  Tavily (web search)  Groq (LLM)        │
                         └──────────────────────────────────────────┘
```

The frontend polls `/rows` every 3 seconds to reflect live agent progress. Each stage updates the shared `RecruitState` as it completes.

## Database

**Postgres 17** — local, no Docker required.

```
jobs       thread_id (PK) · company · role · status [indexed] · tags[] [GIN indexed] · state_json (JSONB) · updated_at
profiles   id=1 (singleton) · profile_json (JSONB) · updated_at
```

`status` and `tags` are real columns with indexes for filtering. Everything else lives in `state_json` — the full `JobState` serialised by Pydantic. Store interface in `backend/app/store/` is abstracted so the backing DB is a one-file swap.

## Quick Start

```bash
createdb commit_to_career          # one-time setup
./start.sh backend                 # FastAPI on :8000
./start.sh frontend                # Next.js on :3000
```

Requires `backend/.env` with `TAVILY_API_KEY`, `GROQ_API_KEY`, and `DATABASE_URL`.
