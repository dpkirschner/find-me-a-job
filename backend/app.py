# main.py


import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import stream_graph_events
from backend.db import initialize_database, list_agents, list_messages
from utils.logger import get_logger

logger = get_logger(__name__)


class ChatRequest(BaseModel):
    message: str


class Agent(BaseModel):
    id: int
    name: str


class AgentsResponse(BaseModel):
    agents: list[Agent]


class Message(BaseModel):
    id: int
    agent_id: int
    role: str
    content: str
    created_at: str


class MessagesResponse(BaseModel):
    messages: list[Message]


app = FastAPI(title="Find Me A Job API")

# Initialize database on startup
initialize_database()
logger.info("Database initialized successfully")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    logger.debug("Health check requested")
    return {"status": "ok"}


@app.get("/agents", response_model=AgentsResponse)
async def get_agents():
    logger.debug("Agents list requested")
    try:
        agents_data = list_agents()
        agents = [Agent(id=agent["id"], name=agent["name"]) for agent in agents_data]
        logger.info(f"Returning {len(agents)} agents")
        return AgentsResponse(agents=agents)
    except Exception as e:
        logger.error(f"Error fetching agents: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch agents")


@app.get("/agents/{agent_id}/messages", response_model=MessagesResponse)
async def get_agent_messages(agent_id: int):
    logger.debug(f"Messages requested for agent {agent_id}")
    try:
        messages_data = list_messages(agent_id)
        messages = [
            Message(
                id=msg["id"],
                agent_id=msg["agent_id"],
                role=msg["role"],
                content=msg["content"],
                created_at=msg["created_at"],
            )
            for msg in messages_data
        ]
        logger.info(f"Returning {len(messages)} messages for agent {agent_id}")
        return MessagesResponse(messages=messages)
    except Exception as e:
        logger.error(f"Error fetching messages for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch messages")


@app.post("/chat")
async def chat(request: ChatRequest):
    logger.info(f"Chat request received with message length: {len(request.message)}")

    if not request.message:
        logger.warning("Empty message received in chat request")
        raise HTTPException(status_code=400, detail="Message must not be empty")

    logger.debug(f"Starting graph streaming for message: {request.message[:50]}...")
    streamer = stream_graph_events(request.message)

    try:
        logger.debug("Getting first event from stream")
        first_event = await streamer.__anext__()
        logger.debug(f"First event received: {first_event}")
    except StopAsyncIteration:
        logger.warning("Stream ended immediately with no events")
        return EventSourceResponse(iter([]))
    except (ConnectionError, requests.exceptions.ConnectionError) as e:
        logger.error(f"LLM connection error: {e}")
        raise HTTPException(status_code=503, detail="LLM service is unavailable")
    except Exception as e:
        logger.error(f"Unexpected error getting first event: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    async def event_generator():
        logger.debug("Starting event generator")
        event_count = 0
        try:
            yield first_event
            event_count += 1

            async for event in streamer:
                event_count += 1
                logger.debug(f"Yielding event #{event_count}: {event}")
                yield event

        except Exception as e:
            logger.error(f"Error in event generator after {event_count} events: {e}")
            yield {"event": "error", "data": f"Stream error: {e}"}
        finally:
            logger.info(f"Event generator completed, total events: {event_count}")

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
