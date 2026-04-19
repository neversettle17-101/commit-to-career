from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
from backend.app.graph import recruiter_graph
from backend.app.api.routes import router


app = FastAPI()

# Allow frontend access

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
