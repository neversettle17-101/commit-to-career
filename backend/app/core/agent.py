import asyncio
import json
import logging
import os
import random
import time
from datetime import datetime, timezone
from groq import AsyncGroq, BadRequestError, RateLimitError
from backend.app.core.tool import Tool

MAX_ITERATIONS = 10
MAX_TOOL_CALLS = 5   # search budget per agent run
MAX_RETRIES    = 3   # retries on 429 before giving up
RETRY_BASE_DELAY = 2 # seconds — doubles each attempt (2s, 4s, 8s)

logger = logging.getLogger(__name__)


class Agent:
    """
    A single agent: a name, a system prompt, a set of tools, and the loop.

    The loop implements the ReAct pattern (Reason + Act):
      1. LLM reasons about what to do next (Thought).
      2. If it calls a tool → run it, append result (Act + Observe), go to 1.
      3. If it returns a plain response → done (Final Answer).

    Resilience: both LLM calls and tool calls retry with exponential backoff on 429.
    Budget: MAX_TOOL_CALLS prevents unbounded search loops.
    """

    def __init__(self, name: str, system_prompt: str, tools: list[Tool]):
        self.name = name
        self.system_prompt = system_prompt
        self.tools = {t.name: t for t in tools}
        self._groq_client: AsyncGroq | None = None

    def _client(self) -> AsyncGroq:
        if self._groq_client is None:
            self._groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        return self._groq_client

    def _emit(self, trace: list | None, kind: str, data: str) -> None:
        from backend.app.models.state import TraceEvent
        ts = datetime.now(timezone.utc).isoformat()
        if trace is not None:
            trace.append(TraceEvent(ts=ts, agent=self.name, kind=kind, data=data))
        logger.info("[%s] %s: %s", self.name, kind, data[:120])

    async def _llm_call_with_backoff(self, trace: list | None, **kwargs) -> any:
        """Call the Groq API with exponential backoff on rate limit errors."""
        for attempt in range(MAX_RETRIES):
            try:
                return await self._client().chat.completions.create(**kwargs)
            except RateLimitError:
                if attempt == MAX_RETRIES - 1:
                    raise
                delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 1)
                self._emit(trace, "error", f"Groq rate limited — waiting {delay:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                await asyncio.sleep(delay)
            except BadRequestError as e:
                if "tool_use_failed" not in str(e):
                    raise
                self._emit(trace, "error", f"malformed tool call — retrying: {str(e)[:120]}")
                kwargs["messages"].append({"role": "user", "content": "Your last tool call was malformed. Please try again with a simpler, plain-English query."})
                # don't count this as a retry attempt — it's a different error

    def _tool_call_with_backoff(self, trace: list | None, tool: Tool, **args) -> str:
        """Run a tool synchronously with retry on 429 / rate limit errors."""
        for attempt in range(MAX_RETRIES):
            try:
                return tool.run(**args)
            except Exception as e:
                is_rate_limit = "429" in str(e) or "rate limit" in str(e).lower() or "too many requests" in str(e).lower()
                if not is_rate_limit or attempt == MAX_RETRIES - 1:
                    raise
                delay = RETRY_BASE_DELAY * (2 ** attempt) + random.uniform(0, 1)
                self._emit(trace, "error", f"Tavily rate limited — waiting {delay:.1f}s (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(delay)  # sync — tool calls run outside the event loop

    async def run(self, user_message: str, trace: list | None = None) -> str:
        self._emit(trace, "start", user_message[:200])
        try:
            return await self._run(user_message, trace)
        except Exception as e:
            self._emit(trace, "error", f"{type(e).__name__}: {e}")
            raise

    async def _run(self, user_message: str, trace: list | None) -> str:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_message},
        ]
        tool_schemas = [t.to_api_schema() for t in self.tools.values()]
        tool_calls_made = 0

        for _ in range(MAX_ITERATIONS):
            # ── Budget check ─────────────────────────────────────────────────
            budget_exhausted = tool_calls_made >= MAX_TOOL_CALLS
            kwargs: dict = {
                "model": "llama-3.3-70b-versatile",
                "messages": messages,
            }
            if tool_schemas and not budget_exhausted:
                kwargs["tools"] = tool_schemas

            if budget_exhausted:
                self._emit(trace, "error", f"search budget exhausted ({MAX_TOOL_CALLS} calls) — forcing final answer")
                messages.append({"role": "user", "content": f"You have used all {MAX_TOOL_CALLS} searches. Now produce your final answer from what you have found."})

            # ── LLM call with backoff ────────────────────────────────────────
            response = await self._llm_call_with_backoff(trace, **kwargs)
            msg = response.choices[0].message

            # ── No tool call → Final Answer ──────────────────────────────────
            if not msg.tool_calls:
                output = msg.content or ""
                self._emit(trace, "finish", output[:200])
                return output

            # ── Append assistant's reasoning + tool decision ─────────────────
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            })

            # ── Execute each tool call with backoff (Act + Observe) ──────────
            for tc in msg.tool_calls:
                tool_name = tc.function.name
                args = json.loads(tc.function.arguments)
                self._emit(trace, "tool_call", f"{tool_name}({args})")
                tool_calls_made += 1

                if tool_name in self.tools:
                    result = self._tool_call_with_backoff(trace, self.tools[tool_name], **args)
                else:
                    result = f"Error: unknown tool '{tool_name}'"
                    self._emit(trace, "error", result)

                self._emit(trace, "tool_result", result[:200])
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

        self._emit(trace, "error", "exceeded max iterations without completing")
        return "Error: agent exceeded max iterations without completing"
