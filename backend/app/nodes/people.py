# research_node.py
import os
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from backend.app.models.state import RecruitState

load_dotenv()

# Initialise once at module level — not inside the function
llm = ChatGroq(model="llama-3.3-70b-versatile")
search_tool = TavilySearchResults(max_results=5)

def people_finder_node(state: RecruitState) -> dict:
    print(f"[people_finder] finding contacts at {state['company']}")

    search = TavilySearchResults(max_results=5)
    raw = search.invoke(
        f"site:linkedin.com {state['company']} {state['role']} OR engineering manager OR recruiter"
    )
    context = "\n\n".join([r["content"] for r in raw])

    prompt = f"""Extract people who work at {state['company']} from these search results.
    Focus on: hiring managers, engineering leads, recruiters, CTOs.

    Search results:
    {context}

    Return a JSON array of objects with these fields:
    name, title, linkedin_url (or "" if not found)

    Example: [{{"name": "Jane Doe", "title": "Engineering Manager", "linkedin_url": "https://linkedin.com/in/janedoe"}}]

    Return ONLY the JSON array, no other text."""

    response = llm.invoke([HumanMessage(content=prompt)])

    import json, re
    try:
        # strip markdown code fences if LLM wraps it
        text = re.sub(r"```json?|```", "", response.content).strip()
        employees = json.loads(text)
    except Exception:
        employees = []   # graceful fallback — don't crash the graph

    return {"employees": employees, "status": "drafting"}
