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

## 10. What Belongs in State vs. What Belongs in a Store

**Question:** Should user profile data (name, email, title, location) live in `JobState` or be read directly from `profile_store` by agents?

**Decision:** Copy profile fields into `JobState` as inputs at the start of `run_pipeline`. State becomes a complete snapshot of everything that pipeline run had access to.

**Why Option A (copy into state) beats Option B (read store directly):**

- **Self-contained:** Any `JobState` snapshot tells you exactly what every agent saw — no need to cross-reference external stores
- **Reproducible:** If the user updates their profile mid-run, the current run is unaffected — it was captured at start time
- **No hidden dependencies:** Agents get all context from state. If an agent needs the user's name, it's in state — not in a side-channel call to a store it shouldn't know about
- **Debuggable:** When something goes wrong, you inspect one object and have the full picture

**The rule:** Data that is *static for the duration of a run* gets copied into state as an input. Data that is *produced during the run* gets written into state by agents. Neither should reach outside state to fetch context mid-pipeline.

**Concepts to read:**
- Blog: [Designing data-intensive applications — event sourcing](https://martin.kleppmann.com/2020/07/06/crdt-hard-parts-hydra.html) — the broader principle of snapshots vs. live reads
- Blog: [The Twelve-Factor App — config](https://12factor.net/config) — the principle of capturing configuration at startup
- [LangGraph state management](https://langchain-ai.github.io/langgraph/concepts/low_level/#state) — how a framework formalises exactly this pattern

---

## 9. Orchestrator as Plain Code, Not an Agent

**Decision:** `orchestrator.py` is a plain Python async function — not an Agent. Agents handle tasks that require judgment. The orchestrator handles sequencing that requires determinism.

**Why this matters:** If the orchestrator were an agent, an LLM would decide whether to run research or skip it — introducing non-determinism where none is needed. The rule: use agents for tasks where the "how" requires judgment (what to search, how to summarize). Use code for tasks where the "what" is already decided (always load resume first, always wait for approval before drafting).

**Concepts to read:**
- Blog: [Agentic design patterns — Anthropic](https://www.anthropic.com/research/building-effective-agents#workflows-vs-agents) — the exact distinction between workflows and agents
- Blog: [When NOT to use an agent](https://hamel.dev/blog/posts/agent/) — Hamel Husain on over-agentification

---

## 10. Nested State Models — Avoiding Schema Bloat

**Decision:** Introduced `UserProfile` as a sub-model inside `JobState`, replacing the previous flat `user_name`, `user_email`, `user_title`, `user_location` fields.

**Why:** Flat state schemas accumulate a new field for every feature. The problem compounds: adding `previous_company` and `university` would mean two more top-level fields in `JobState`, with no grouping signal. Instead, a `UserProfile` domain object groups all user data — adding a new profile field means updating `UserProfile` only. `JobState` stays stable.

This is the same principle that frameworks like LangGraph formalise with typed state channels: the pipeline envelope (what the orchestrator controls) is separate from the domain objects (what agents produce or consume).

**The rule:** If a set of fields always moves together and belongs to the same concern, they belong in a sub-model. `JobState` should read like a pipeline manifest, not a database row.

**Concepts to read:**
- [Pydantic nested models](https://docs.pydantic.dev/latest/concepts/models/#nested-models)
- Blog: [Domain-Driven Design — Value Objects](https://martinfowler.com/bliki/ValueObject.html) — Martin Fowler on grouping by concept, not by proximity

---

## 11. Warm Contact Discovery — Personalising Agent Search via Prompt Context

**Decision:** Rather than a separate agent or API, the PeopleAgent runs additional targeted LinkedIn searches using the user's `previous_company` and `university` from their profile, and tags results `warm: true`.

**Why:** Warm contacts (people who share your alma mater or previous employer) respond to outreach at significantly higher rates. The key insight is that *agent behaviour changes through the prompt, not the loop*. The same tool (`web_search`), the same loop, the same agent class — different inputs produce different, personalised results.

Tagging with `warm: bool` at the agent output level keeps the metadata close to the data. Downstream code (UI, future outreach step) can branch on it without re-running searches.

**The rule:** Enrich agent prompts with user context. Tag results with metadata at the source. Don't re-derive metadata downstream.

**Concepts to read:**
- Blog: [Prompt engineering for agentic tasks](https://www.anthropic.com/research/building-effective-agents#prompt-engineering-for-agentic-systems) — Anthropic on how prompts drive agent behaviour
- [LinkedIn search operators](https://www.linkedin.com/help/linkedin/answer/a524335) — how site:linkedin.com searches work

---

## 12. Workflow vs. Agentic System — What Is This Project?

**Question:** Is this project a workflow or an agentic system?

**Answer:** It's a workflow that contains agents — and the distinction matters.

**The orchestrator is a workflow.** The control flow is fixed in code: load resume → research + people in parallel → wait for approval → draft. No LLM decides that sequence; `orchestrator.py` does.

**The individual nodes are agents.** Inside each node, an LLM exercises judgment — it decides how many searches to run, what queries to use, whether results are good enough. That autonomy within a bounded task is what makes them agents.

**The rule:** Use agents for tasks where the *how* requires judgment. Use code for tasks where the *what* is already decided. The orchestrator always knows what to do next. The agents figure out how to do their individual task.

A fully agentic system would have an LLM deciding the control flow too — e.g. "should I research more before finding people?" — which introduces non-determinism where you often don't want it. For job outreach, the sequence is well-understood, so a workflow is the right call.

**Concepts to read:**
- Blog: [Building effective agents — Anthropic](https://www.anthropic.com/research/building-effective-agents#workflows-vs-agents) — the canonical definition of workflows vs. agents
- Blog: [When NOT to use an agent](https://hamel.dev/blog/posts/agent/) — Hamel Husain on over-agentification

---

## 14. Store Persistence — Interface Abstraction over SQLite

**Decision:** Replaced the in-memory `_store: dict` in `sheet_store.py` and the global `_profile` variable in `profile_store.py` with a SQLite-backed store via a new `db.py` module.

**Why:** All job state was lost on every backend restart. A 60-second pipeline running in the background would produce results that vanished the moment you hit Ctrl+C. The fix: write state to disk after every mutation.

**The key pattern — interface abstraction:** The public API of both stores (`add_state`, `update_state`, `get_state`, `get_all_states`, `approve`) did not change. Only the *implementation* changed. The orchestrator and routes have zero awareness that the backing store switched from a dict to a database. This is the "ports and adapters" (hexagonal architecture) pattern — consumers depend on an interface, not on an implementation.

**Why SQLite over Postgres/Redis:** Zero infrastructure cost. Zero new dependencies — `sqlite3` is in Python's standard library. The workload is trivially low concurrency (one pipeline per background task). When the workload outgrows SQLite, the swap to Postgres is one file change (`db.py`) because the interface is isolated.

**How it works:**
- `db.py` owns the SQLite connection with a `threading.Lock` for thread safety (FastAPI runs handlers on a thread pool)
- `JobState` is serialised to/from JSON using Pydantic's `model_dump_json()` / `model_validate_json()` — the store never deserialises manually
- The `profiles` table uses a single-row constraint (`CHECK (id = 1)`) with `ON CONFLICT DO UPDATE` — a simple "singleton row" pattern for global config

**The rule:** Define a store interface first. Make the implementation a detail behind it. This is the decision that lets you write "swap to Postgres = one file change" with confidence in an interview.

**Concepts to read:**
- Blog: [Hexagonal Architecture — Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/) — the original paper on ports and adapters
- Blog: [Designing Data-Intensive Applications — storage engines](https://dataintensive.net/) — Chapter 3 explains why SQLite is the right choice for embedded, low-concurrency workloads
- [Python sqlite3 docs](https://docs.python.org/3/library/sqlite3.html) — especially threading and connection modes
- Blog: [Parse, don't validate — Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) — why Pydantic's `model_validate_json` is the right deserialisation primitive

---

## 13. Pure Agent Strategy — An Alternative to Prescribed Search Order

**Current approach (structured agent):** System prompts prescribe the search order explicitly — "First call: X, Second call: Y." The LLM executes a recipe, not a plan.

**Pure agent approach:** Give the agent a goal and tools, no script:
> "Your goal is to find hiring contacts at [company]. You have `web_search`. Use it however many times you need to build a confident list."

The LLM then plans its own strategy — it might search LinkedIn, see sparse results, pivot to GitHub to find engineers, cross-reference with a blog post. That's genuine planning, not recipe-following.

**What you'd change in code:** Strip the numbered search instructions from the system prompts in `agents/people.py` and `agents/researcher.py`. Replace with a goal statement and success criteria. The agent loop in `core/agent.py` requires zero changes — the loop already supports arbitrary tool call sequences.

**The tradeoff:**

| | Structured (current) | Pure agent |
|---|---|---|
| Predictability | High — fixed search count | Variable — LLM decides |
| Quality | Consistent but rigid | Adaptive, but model-dependent |
| Debuggability | Easy — trace is predictable | Must read full message history |
| Token cost | Fixed | Variable |

**The constraint:** Pure agent planning works well with frontier models (Claude, GPT-4o). With a mid-tier model like Llama 3.3 on Groq, removing scaffolding can cause looping or missed searches. To do this properly: switch to a stronger model and drop the prescribed order entirely.

**Concepts to read:**
- Blog: [ReAct — Reasoning + Acting in LLMs](https://react-lm.github.io/) — the original paper on agents that plan their own tool-use steps
- Blog: [Building effective agents — Anthropic](https://www.anthropic.com/research/building-effective-agents#agents) — when to use fully autonomous agents vs. structured workflows
