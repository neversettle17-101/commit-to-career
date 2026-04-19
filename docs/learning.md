# Learning Log

Each entry documents a tech decision made in this project and the concepts behind it.

---

## 1. Agent State with TypedDict → Pydantic BaseModel

**Decision:** Replaced `TypedDict` with Pydantic `BaseModel` for `JobState`.

**Why:** `TypedDict` is a static type hint with no runtime enforcement — Python won't stop you from writing a wrong type to a field. `BaseModel` validates at runtime, so bad agent output raises an error at the boundary instead of silently propagating as `None` downstream.

**Concepts to read:**
- [Pydantic BaseModel docs](https://docs.pydantic.dev/latest/concepts/models/)
- Blog: [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) — Alexis King (the key mental model behind this decision)

---

## 2. Sequential Agent Pipeline (Linear Graph → plain Python)

**Decision:** The original LangGraph sequential graph was replaced with a plain `async def run_pipeline()`. Each step runs in order; each step's output is available to the next.

**Why:** Sequential flow is just function calls. You don't need a framework for it. Using a graph for a linear pipeline adds indirection without adding capability.

**Concepts to read:**
- [LangGraph: Building graphs](https://langchain-ai.github.io/langgraph/concepts/low_level/#graphs) — read this to see what the framework was doing under the hood

---

## 3. Async Background Task + Polling (Agent ↔ API communication)

**Decision:** `POST /rows` returns immediately with a `thread_id`. The pipeline runs as a FastAPI `BackgroundTask`. The frontend polls `GET /rows` every 3 seconds.

**Why:** LLM calls are slow (5–30s). Blocking the HTTP request would time out. Fire-and-forget with polling keeps the API responsive and shows live status per stage.

**Concepts to read:**
- [FastAPI: Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- Blog: [Polling vs WebSockets vs SSE — when to use which](https://ably.com/blog/websockets-vs-long-polling)

---

## 4. Status Field as Agent Communication Signal

**Decision:** `JobState` carries a `status` string. Each stage of the orchestrator writes to it before the frontend polls it back.

**Why:** A status field is a lightweight state machine. It lets the frontend know exactly where the pipeline is without any pub/sub infrastructure.

**Concepts to read:**
- [Finite State Machines](https://refactoring.guru/design-patterns/state)
- [LangGraph: Conditional routing](https://langchain-ai.github.io/langgraph/how-tos/branching/)

---

## 5. The Agent Loop (Phase 1 — core concept)

**Decision:** Built the agent loop from scratch in `core/agent.py` using the raw Groq SDK instead of using a framework.

**The loop:**
1. Call LLM with message history
2. If LLM wants to call a tool → run it, append result to history, go to 1
3. If LLM returns plain text → done

This is what every agent framework (CrewAI, LangGraph, AutoGen) hides inside its abstractions. Understanding it means you can read any framework's source code and know what it's doing.

**Key file:** `backend/app/core/agent.py`

**Concepts to read:**
- [OpenAI Function Calling guide](https://platform.openai.com/docs/guides/function-calling) — the spec this loop implements (Groq follows the same spec)
- [Anthropic Tool Use guide](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — same concept, different provider
- Blog: [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — the research paper behind the agent loop pattern
- Blog: [Building an agent from scratch](https://www.anthropic.com/research/building-effective-agents) — Anthropic's practical guide to agent design

---

## 6. Tool as a JSON Schema + Python Function

**Decision:** Each tool in `backend/app/core/tool.py` is a dataclass pairing a Python function with a raw JSON Schema. The schema is what the LLM API receives to understand what tools are available.

**Why:** The LLM does not "call" the tool directly — it outputs a JSON object matching the schema. Your code reads that JSON, finds the matching Python function, calls it, and feeds the result back to the LLM. Understanding this mechanism is what separates someone who uses tool calling from someone who understands it.

**Key file:** `backend/app/tools/search.py`, `backend/app/core/tool.py`

**Concepts to read:**
- [JSON Schema specification](https://json-schema.org/understanding-json-schema/) — what you're writing when you define `parameters`
- [OpenAI Function Calling — how it works internally](https://platform.openai.com/docs/guides/function-calling#how-it-works)
- Blog: [How tool use actually works under the hood](https://www.boundaryml.com/blog/type-definition-prompting-baml) — traces the full request/response cycle

---

## 7. Parallel Fan-out with asyncio.gather

**Decision:** `ResearchAgent` and `PeopleAgent` run simultaneously via `asyncio.gather()` in `orchestrator.py`.

**Why:** Both agents only need `(company, role)` as input — neither depends on the other's output. Running them in parallel cuts wall-clock time roughly in half (time = max of both, not their sum).

**The rule:** Run agents in parallel when there is no data dependency between them. Run them sequentially when one's output is another's input.

**Key file:** `backend/app/orchestrator.py` — look for `# PATTERN 2`

**Concepts to read:**
- [Python asyncio: Gathering tasks](https://docs.python.org/3/library/asyncio-task.html#asyncio.gather)
- Blog: [Concurrency vs Parallelism in Python](https://realpython.com/python-concurrency/) — async IO vs threading vs multiprocessing
- Talk: [Concurrency is not Parallelism — Rob Pike](https://go.dev/talks/2012/waza.slide) — the core conceptual distinction (Go-focused but universally applicable)

---

## 8. Human-in-the-Loop (HITL) as a Workflow Gate

**Decision:** The pipeline suspends after research and people-finding (`status = "awaiting_review"`). It resumes only after `POST /rows/{id}/approve` sets `state.approved = True`.

**Why:** Letting an agent draft and send a message without human review is the most common mistake in production agentic systems. A HITL gate forces a human to verify the research before the expensive/irreversible action (sending a message) happens.

**How it works:** The orchestrator polls the store every 2 seconds in a `while` loop. The `/approve` endpoint writes directly to the in-memory store. The loop reads the updated state and breaks when `approved` is True.

**Key file:** `backend/app/orchestrator.py` — look for `# PATTERN 3`

**Concepts to read:**
- [Anthropic: Building effective agents — Human-in-the-loop](https://www.anthropic.com/research/building-effective-agents#human-in-the-loop)
- Blog: [Patterns for agentic systems: when to involve humans](https://eugeneyan.com/writing/agentic/) — Eugene Yan's practical breakdown
- [LangGraph HITL docs](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/) — how a framework solves the same problem (compare with your raw implementation)

---

## 9. Orchestrator as Plain Code, Not an Agent

**Decision:** `orchestrator.py` is a plain Python async function — not an Agent. Agents handle tasks that require judgment. The orchestrator handles sequencing that requires determinism.

**Why this matters:** If the orchestrator were an agent, an LLM would decide whether to run research or skip it — introducing non-determinism where none is needed. The rule: use agents for tasks where the "how" requires judgment (what to search, how to summarize). Use code for tasks where the "what" is already decided (always load resume first, always wait for approval before drafting).

**Concepts to read:**
- Blog: [Agentic design patterns — Anthropic](https://www.anthropic.com/research/building-effective-agents#workflows-vs-agents) — the exact distinction between workflows and agents
- Blog: [When NOT to use an agent](https://hamel.dev/blog/posts/agent/) — Hamel Husain on over-agentification
