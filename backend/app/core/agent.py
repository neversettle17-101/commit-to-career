import json
import os
from groq import AsyncGroq
from backend.app.core.tool import Tool

# Safety cap — prevents the agent from looping forever if the LLM misbehaves.
MAX_ITERATIONS = 10


class Agent:
    """
    A single agent: a name, a system prompt, a set of tools, and the loop.

    The loop is the core of what every agent framework hides from you:
      1. Call the LLM with the current message history.
      2. If the LLM wants to call a tool → run it, append the result, go to 1.
      3. If the LLM produces a plain text response → return it. Done.

    This is ALL an "agent" is. The system prompt defines its role.
    The tools define what it can do. The loop is how it reasons.
    """

    def __init__(self, name: str, system_prompt: str, tools: list[Tool]):
        self.name = name
        self.system_prompt = system_prompt
        self.tools = {t.name: t for t in tools}
        self._groq_client: AsyncGroq | None = None  # lazy — env not loaded at import time

    def _client(self) -> AsyncGroq:
        if self._groq_client is None:
            self._groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))
        return self._groq_client

    async def run(self, user_message: str) -> str:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_message},
        ]
        tool_schemas = [t.to_api_schema() for t in self.tools.values()]

        for iteration in range(MAX_ITERATIONS):
            kwargs: dict = {
                "model": "llama-3.3-70b-versatile",
                "messages": messages,
            }
            # Only pass tools if this agent has any — empty list causes API errors.
            if tool_schemas:
                kwargs["tools"] = tool_schemas

            response = await self._client().chat.completions.create(**kwargs)
            msg = response.choices[0].message

            # ── No tool call → agent is done ────────────────────────────────
            if not msg.tool_calls:
                return msg.content or ""

            # ── Append the assistant's decision to call tool(s) ─────────────
            # The LLM needs to see its own tool-call decisions in the history
            # so it can reason about the results on the next iteration.
            messages.append({
                "role": "assistant",
                "content": msg.content,  # often None when there are tool calls
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

            # ── Execute each tool call and feed results back ─────────────────
            for tc in msg.tool_calls:
                tool_name = tc.function.name
                args = json.loads(tc.function.arguments)
                print(f"[{self.name}] calling tool: {tool_name}({args})")

                if tool_name in self.tools:
                    result = self.tools[tool_name].run(**args)
                else:
                    result = f"Error: unknown tool '{tool_name}'"

                # Tool results go back into the message history.
                # The LLM will read these on the next loop iteration.
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

            # Loop: LLM now sees its tool results and decides what to do next.

        return "Error: agent exceeded max iterations without completing"
