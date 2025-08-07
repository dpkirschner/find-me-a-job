from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import run_graph


class ChatRequest(BaseModel):
    message: str


app = FastAPI(title="Find Me A Job API")

# Configure CORS to allow the React dev server
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


async def token_stream(user_message: str) -> AsyncGenerator[dict, None]:
    """
    Generate streaming tokens from the LLM response using the LangGraph.
    """
    if not user_message:
        raise HTTPException(status_code=400, detail="message must not be empty")

    try:
        # Get the full response from the graph
        llm_response = run_graph(user_message)
        
        # Split response into tokens for streaming
        tokens = llm_response.split()
        for token in tokens:
            yield {"event": "message", "data": token + " "}
        
        # Final event to signal completion to the client
        yield {"event": "done", "data": "[DONE]"}
        
    except Exception as e:
        # Stream error message
        yield {"event": "error", "data": f"Error generating response: {str(e)}"}
        yield {"event": "done", "data": "[DONE]"}


@app.post("/chat")
async def chat(request: ChatRequest):
    async def event_generator():
        async for event in token_stream(request.message):
            yield event

    # Use text/event-stream with SSE via EventSourceResponse
    return EventSourceResponse(event_generator())
