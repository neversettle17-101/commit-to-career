# nodes/resume.py
from langchain_community.document_loaders import PyPDFLoader
from state import RecruitState

RESUME_PATH = "resume.pdf"   # put your PDF in the project root


def resume_node(state: RecruitState) -> dict:
    # ── Skip if already loaded ────────────────────────────────────────────────
    # This is the "cache" behaviour — checkpointer already has it from a
    # previous run, or it was passed in — don't re-read the file
    if state.get("resume_text", "").strip():
        print("[resume_node] already in state — skipping")
        return {}   # return empty dict = change nothing in state

    # ── Load PDF ──────────────────────────────────────────────────────────────
    print("[resume_node] loading resume from disk")
    try:
        loader = PyPDFLoader(RESUME_PATH)
        pages  = loader.load()
        text   = "\n".join(p.page_content for p in pages).strip()
    except FileNotFoundError:
        print(f"[resume_node] resume not found at {RESUME_PATH}")
        return {"resume_text": "", "error": f"Resume not found at {RESUME_PATH}"}

    print(f"[resume_node] loaded {len(text)} chars")
    return {"resume_text": text}