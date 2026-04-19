# research_node.py
import os, json, re
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import HumanMessage
from backend.app.models.state import RecruitState, Resource

load_dotenv()

llm = ChatGroq(model="llama-3.3-70b-versatile")
search_tool = TavilySearchResults(max_results=5)

VALID_TYPES = {"blog", "article", "github", "linkedin"}


def research_node(state: RecruitState) -> dict:
    print(f"\n[research_node] searching for: {state['company']}")

    # ── Two targeted searches ─────────────────────────────────────────────────
    general_results = search_tool.invoke(
        f"{state['company']} company overview product tech stack culture funding"
    )
    blog_results = search_tool.invoke(
        f"{state['company']} engineering blog technical articles github"
    )

    # ── Build external_links directly from Tavily results ────────────────────
    # No need to involve the LLM here — Tavily already gives us urls and content
    external_links = []

    for r in blog_results:
        url = r.get("url", "")
        if not url:
            continue

        # Infer type from the URL itself
        if "github.com" in url:
            link_type = "github"
        elif "linkedin.com" in url:
            link_type = "linkedin"
        else:
            link_type = "blog"

        external_links.append(Resource(
            name=r.get("title") or url,   # Tavily returns a title field
            url=url,
            type=link_type,
        ))

    print(f"[research_node] found {len(external_links)} external links")

    # ── Feed only general results to LLM for summarisation ───────────────────
    # LLM's only job now: summarise text. Nothing about links.
    general_text = "\n\n".join([r["content"] for r in general_results])

    prompt = f"""You are helping a recruiter research a company before reaching out.

    Company: {state['company']}
    Role being targeted: {state['role']}

    Search results:
    {general_text}

    Write a 3-4 sentence summary covering:
    1. What the company does (product, customers)
    2. Their tech stack and engineering culture
    3. Their stage or recent news (funding, growth, hiring)
    4. Why a {state['role']} would find this company interesting

    Be specific. Use real details from the search results.
    If you cannot find the company, respond with exactly: COMPANY_NOT_FOUND"""

    response = llm.invoke([HumanMessage(content=prompt)])
    summary = response.content.strip()

    # ── Handle not found ──────────────────────────────────────────────────────
    if "COMPANY_NOT_FOUND" in summary:
        return {
            "company_overview": "",
            "external_links":   [],
            "status":           "error",
            "error":            f"Could not find company: {state['company']}",
        }

    return {
        "company_overview": summary,
        "external_links":   external_links,
        "status":           "done",
        "error":            None,
    }
