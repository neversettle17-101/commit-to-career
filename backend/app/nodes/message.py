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

def message_node(state: RecruitState) -> dict:
    print("[message] drafting outreach message")

    top_contact = state["employees"][0] if state["employees"] else {"name": "Hiring Manager", "title": ""}

    prompt = f"""You are writing a cold outreach message from a job seeker.

    About the company:
    {state['company_overview']}

    Target contact: {top_contact['name']} — {top_contact['title']}
    Role I'm targeting: {state['role']}

    My background (from resume):
    {state['resume_text']}

    Write a concise, personalised cold outreach message (LinkedIn DM or email).
    - Max 120 words
    - Open with something specific about the company (not generic flattery)
    - One sentence on why my background is relevant
    - Clear ask : Looking to work at the company
    - Friendly, not salesy
    Return only the message text."""

    response = llm.invoke([HumanMessage(content=prompt)])
    return {"message": response.content, "status": "awaiting_review"}