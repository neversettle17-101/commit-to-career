from dataclasses import dataclass
from typing import Callable


@dataclass
class Tool:
    name: str
    description: str
    # Raw JSON Schema for the function's parameters — this is exactly what
    # the LLM API receives. No magic: just a dict you write once and reuse.
    parameters: dict
    fn: Callable

    def run(self, **kwargs) -> str:
        return str(self.fn(**kwargs))

    def to_api_schema(self) -> dict:
        # Groq (and OpenAI) expect this exact shape for function calling.
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
