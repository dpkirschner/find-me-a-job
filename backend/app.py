# main.py

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import stream_graph_events


class ChatRequest(BaseModel):
    message: str


app = FastAPI(title="Find Me A Job API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/chat")
async def chat(request: ChatRequest):
    if not request.message:
        raise HTTPException(status_code=400, detail="Message must not be empty")

    streamer = stream_graph_events(request.message)

    try:
        first_event = await streamer.__anext__()
    except StopAsyncIteration:
        return EventSourceResponse(iter([]))
    except (ConnectionError, requests.exceptions.ConnectionError):
        raise HTTPException(status_code=503, detail="LLM service is unavailable")

    async def event_generator():
        yield first_event
        async for event in streamer:
            yield event

    return EventSourceResponse(event_generator())
