# Project Plan: Multi-Agent Job Search Workflow

## Goal
Build a job search automation tool that also teaches how multi-agent systems work from the inside out.

---

## Two-Phase Approach

### Phase 1 — Build the Agent Loop from Scratch
Use the raw Groq SDK with no frameworks. Implement the tool-calling loop manually so every LLM call, every tool execution, and every message is visible in your own code.

You will understand:
- What an "agent" actually is (a loop, not magic)
- How tool calling works at the API level
- How results feed back into the LLM to continue reasoning

### Phase 2 — Refactor with OpenAI Agents SDK
Swap your hand-written loop for the production SDK equivalent. The orchestration logic stays identical — only the boilerplate disappears.

You will understand:
- What frameworks actually do (and don't do)
- Why they exist and when they're worth the abstraction cost

---

## Three Workflow Patterns

Each pattern is explicitly labeled in the code so you can find and study it directly.

| Pattern | Where it appears | What it teaches |
|---|---|---|
| Sequential | Resume loads before any agent runs | Linear handoff, context passing |
| Parallel fan-out | Research + people-finding run simultaneously | Independent agents, concurrency |
| Human-in-the-loop | Pipeline pauses after research for your approval | Suspending execution, human oversight |

---

## How the Product Works

1. You enter a company name and role
2. Your resume is loaded
3. A **Research Agent** and a **People Agent** run in parallel
   - Research Agent finds company overview, blog posts, GitHub links
   - People Agent finds hiring managers and recruiters
4. Pipeline pauses — you review the research and contacts
5. You click **Approve**
6. A **Draft Agent** writes a personalised cold outreach message
7. Done

---

## Key Insight

All three agents share the same underlying loop. The only difference between them is:
- Their system prompt (what role they play)
- Which tools they're allowed to use

This is the most important thing to internalize before moving to any framework.

---

## New API Endpoint
`POST /rows/{id}/approve` — resumes the pipeline after human review.

---

## What You'll Be Able to Read After This
- Any agent framework's source code (CrewAI, LangGraph, AutoGen) and understand what it's doing
- Architecture diagrams that use terms like "tool use", "agent handoff", "parallel execution"
- Production agent system designs at companies
