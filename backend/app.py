# main.py

import asyncio
from collections.abc import AsyncGenerator

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import stream_graph_events
from backend.db import (
    agent_exists,
    create_agent,
    delete_agent,
    initialize_database,
    insert_message,
    list_agents,
    list_messages,
)
from utils.logger import get_logger

logger = get_logger(__name__)


async def tee_stream_and_queue(streamer: AsyncGenerator, queue: asyncio.Queue):
    try:
        async for event in streamer:
            await queue.put(event)
            yield event
    except Exception as e:
        logger.error(f"Error during stream generation: {e}")
        await queue.put({"event": "error", "data": str(e)})
        yield {"event": "error", "data": f"Stream error: {e}"}
    finally:
        # This is critical: send the sentinel value to signal the
        # background task that the stream has ended.
        await queue.put(None)
        logger.info("TEE: Stream finished, 'None' sentinel sent to queue.")


class ChatRequest(BaseModel):
    message: str
    agent_id: int


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


class CreateAgentRequest(BaseModel):
    name: str


class CreateAgentResponse(BaseModel):
    agent: Agent


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


@app.post("/agents", response_model=CreateAgentResponse, status_code=201)
async def create_new_agent(request: CreateAgentRequest):
    logger.debug(f"Agent creation requested with name: {request.name}")
    try:
        agent_data = create_agent(request.name)
        agent = Agent(id=agent_data["id"], name=agent_data["name"])
        logger.info(f"Created new agent with id {agent.id} and name '{agent.name}'")
        return CreateAgentResponse(agent=agent)
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise HTTPException(status_code=500, detail="Failed to create agent")


@app.delete("/agents/{agent_id}", status_code=204)
async def delete_existing_agent(agent_id: int):
    logger.debug(f"Agent deletion requested for id: {agent_id}")

    # Check if agent exists first
    if not agent_exists(agent_id):
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        deleted = delete_agent(agent_id)
        if deleted:
            logger.info(f"Successfully deleted agent with id {agent_id}")
            return  # 204 No Content response
        else:
            logger.warning(f"Agent {agent_id} could not be deleted")
            raise HTTPException(status_code=500, detail="Failed to delete agent")
    except Exception as e:
        logger.error(f"Error deleting agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete agent")


@app.get("/agents/{agent_id}/messages", response_model=MessagesResponse)
async def get_agent_messages(agent_id: int):
    logger.debug(f"Messages requested for agent {agent_id}")

    # Check if agent exists first
    if not agent_exists(agent_id):
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

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


async def persist_from_queue(agent_id: int, queue: asyncio.Queue):
    logger.info(
        f"BACKGROUND: Persistence task started for agent {agent_id}, awaiting items..."
    )
    assistant_response = ""
    while True:
        event = await queue.get()
        if event is None:  # Sentinel value received, stream is done
            break

        if event.get("event") == "message":
            assistant_response += event.get("data", "")

    if assistant_response.strip():
        try:
            insert_message(agent_id, "assistant", assistant_response)
            logger.info(
                f"BACKGROUND: Assistant response saved successfully for agent {agent_id}"
            )
        except Exception as e:
            logger.error(f"BACKGROUND: Failed to save assistant response to DB: {e}")
    else:
        logger.warning(
            f"BACKGROUND: No assistant response to save for agent {agent_id}"
        )


@app.post("/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    logger.info(
        f"Chat request received with message length: {len(request.message)} for agent {request.agent_id}"
    )

    if not request.message:
        logger.warning("Empty message received in chat request")
        raise HTTPException(status_code=400, detail="Message must not be empty")

    if not agent_exists(request.agent_id):
        logger.warning(f"Agent {request.agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        insert_message(request.agent_id, "user", request.message)
        logger.info(f"User message saved to database for agent {request.agent_id}")
    except Exception as e:
        logger.error(f"Error saving user message: {e}")
        raise HTTPException(status_code=500, detail="Failed to save message")

    try:
        original_streamer = stream_graph_events(request.message)
        persistence_queue = asyncio.Queue()
        background_tasks.add_task(
            persist_from_queue, request.agent_id, persistence_queue
        )

        teed_generator = tee_stream_and_queue(original_streamer, persistence_queue)

        return EventSourceResponse(
            teed_generator,
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        logger.error(f"Failed to initialize stream: {e}")
        raise HTTPException(
            status_code=500, detail="LLM service failed to start stream"
        )
