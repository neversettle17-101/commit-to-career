import os
from tavily import TavilyClient
from backend.app.core.tool import Tool


def _web_search(query: str) -> str:
    client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
    response = client.search(query, max_results=5)
    results = response.get("results", [])
    return "\n\n".join(
        f"Title: {r.get('title', '')}\nURL: {r.get('url', '')}\nContent: {r.get('content', '')}"
        for r in results
    )


# One tool definition, shared across any agent that needs web search.
# Tools are not owned by agents — they are capabilities granted to agents.
web_search = Tool(
    name="web_search",
    description="Search the web for up-to-date information about a company, person, or topic.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query to run",
            }
        },
        "required": ["query"],
    },
    fn=_web_search,
)
