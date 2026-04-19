# graph.py
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from state import RecruitState
from nodes.resume   import resume_node
from nodes.research import research_node
from nodes.people   import people_node
from nodes.message  import message_node


def route_after_research(state: RecruitState) -> str:
    return "error" if state["status"] == "error" else "find_people"


def build_graph():
    g = StateGraph(RecruitState)

    g.add_node("load_resume",  resume_node)    # ← new, runs first
    g.add_node("research",     research_node)
    g.add_node("find_people",  people_node)
    g.add_node("draft_message", message_node)

    g.set_entry_point("load_resume")           # ← starts here now

    # Resume always flows into research
    g.add_edge("load_resume", "research")

    g.add_conditional_edges("research", route_after_research, {
        "find_people": "find_people",
        "error":        END,
    })

    g.add_edge("find_people",   "draft_message")
    g.add_edge("draft_message", END)

    return g.compile(checkpointer=MemorySaver())


recruiter_graph = build_graph()