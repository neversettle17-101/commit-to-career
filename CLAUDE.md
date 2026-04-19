# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered recruiter cold outreach tool. Users provide a company name and job role; the system researches the company, finds relevant people, and drafts a personalized outreach message using a multi-agent LangGraph workflow.

## Commands

### Frontend (`/ui`)
```bash
npm run dev      # Dev server at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

### Backend (`/backend`)
```bash
# Activate virtualenv first
source backend/venv/bin/activate

# Run FastAPI server (port 8000)
uvicorn app.main:app --reload

# Run tests
pytest app/tests/
```

### Environment
API keys live in root `.env`: `TAVILY_API_KEY`, `GROQ_API_KEY`. Backend reads them via `python-dotenv`.

## Architecture

### Backend — LangGraph Agent Pipeline

Entry point: `backend/app/main.py` (FastAPI). Workflow defined in `backend/app/graph.py`.

**Node execution order** (defined in `graph.py`):
1. `load_resume` (`nodes/resume.py`) — Loads PDF from disk via `PyPDFLoader`
2. `research` (`nodes/research.py`) — Dual Tavily search + Groq LLM to produce `company_overview` and `external_links`
3. `find_people` (`nodes/people.py`) — LinkedIn search via Tavily, LLM extracts structured JSON into `employees` list
4. `draft_message` (`nodes/message.py`) — Groq LLM drafts personalized message using top contact

State schema is `RecruitState` (TypedDict) in `models/state.py`. Status transitions: `researching → finding_people → drafting → awaiting_review` (or `error`).

**API routes** (`api/routes.py`):
- `POST /rows` — Starts the graph as a background task, returns `{ thread_id, status }` immediately
- `GET /rows` — Returns all tasks with their current state

### Frontend — Next.js + React

Single-page app. `app/page.tsx` renders only `CompanySheet.tsx`, which is a large monolithic component containing all UI logic: form input, data table, expandable row details, and 3-second polling of `GET /rows`.

API client lives in `services/api.ts` with two functions (`createRow`, `fetchRows`) pointing to `http://localhost:8000`.

shadcn/ui components in `components/ui/` use Radix primitives + Tailwind CSS v4 with CSS variables (Nova style, configured in `components.json`).

## Learning Goals

The user is learning multi-agentic workflows through this project. Key areas of focus:
- How agents manage and share state
- Communication patterns between agents
- Performance optimisation of agent pipelines

**Every new feature must have a corresponding entry in `docs/learning.md`** documenting the tech decision made and the concepts behind it, with links to good technical reading.
