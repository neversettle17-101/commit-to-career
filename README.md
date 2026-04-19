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

## Quick Start

```bash
./start.sh backend    # FastAPI on :8000
./start.sh frontend   # Next.js on :3000
```

Requires `.env` at the project root with `TAVILY_API_KEY` and `GROQ_API_KEY`.
