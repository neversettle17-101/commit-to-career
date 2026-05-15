# Commit to Career

Paste a company name and role — get a researched, personalized recruiter outreach message in seconds.

## What is this?

Commit to Career is an AI-powered job outreach tool. You give it a company name and a target role; it researches the company, finds relevant people to contact, and drafts a personalized cold outreach message — all automatically.

**The workflow:**
1. You enter a company name and job role in the UI
2. The backend runs a multi-agent pipeline (research → find people → draft message)
3. The UI polls for live progress and shows results as each stage completes
4. You review and send the drafted outreach message

**Key features:**
- Company research using live web search (Tavily)
- LinkedIn people finder to surface relevant contacts
- LLM-drafted personalized outreach (Groq)
- Resume-aware — the draft references your background
- Real-time progress updates via polling

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

**Agent pipeline** (`backend/app/agents/`):
- `researcher.py` — Dual Tavily search + Groq LLM → company overview and external links
- `people.py` — LinkedIn search via Tavily, LLM extracts structured employee list
- `drafter.py` — Groq LLM drafts personalized message using top contact and your resume

**State** flows through `RecruitState` (TypedDict in `models/state.py`). Status transitions: `researching → finding_people → drafting → awaiting_review` (or `error`).

## Database

**Postgres 17** — local, no Docker required.

```
jobs       thread_id (PK) · company · role · status [indexed] · tags[] [GIN indexed] · state_json (JSONB) · updated_at
profiles   id=1 (singleton) · profile_json (JSONB) · updated_at
```

`status` and `tags` are real columns with indexes for filtering. Everything else lives in `state_json` — the full `JobState` serialised by Pydantic. Store interface in `backend/app/store/` is abstracted so the backing DB is a one-file swap.

## Local Setup

### Prerequisites

- **Node.js** 18+ and **npm**
- **Python** 3.11+
- **PostgreSQL 17** running locally
- API keys for [Tavily](https://tavily.com) and [Groq](https://console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/neversettle17-101/commit-to-career.git
cd commit-to-career
```

### 2. Set up environment variables

Create `backend/.env`:

```env
TAVILY_API_KEY=your_tavily_key_here
GROQ_API_KEY=your_groq_key_here
DATABASE_URL=postgresql://localhost/commit_to_career
```

### 3. Set up the database

```bash
createdb commit_to_career
```

### 4. Set up the Python backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r app/requirements.txt
```

### 5. Set up the frontend

```bash
cd ui
npm install
```

### 6. Run the app

Open two terminals from the project root:

```bash
# Terminal 1 — backend (port 8000)
./start.sh backend

# Terminal 2 — frontend (port 3000)
./start.sh frontend
```

Then open [http://localhost:3000](http://localhost:3000).

### Running tests

```bash
source backend/venv/bin/activate
pytest backend/app/tests/
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui |
| Backend | FastAPI, Python 3.11+ |
| AI / Search | Groq LLM, Tavily web search |
| Database | PostgreSQL 17 |
| Agents | Custom multi-agent pipeline |
