# main.py

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import stream_graph_events
from backend.db import (
    agent_exists,
    create_agent,
    # New conversation-based functions
    create_conversation,
    delete_agent,
    delete_conversation,
    get_conversation_by_thread,
    get_conversation_messages,
    get_messages_by_thread,
    get_next_sequence_number,
    get_or_create_conversation,
    initialize_database,
    list_agents,
    list_conversations,
    save_message,
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
    thread_id: str = None  # Optional thread ID for conversation continuity


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


class Conversation(BaseModel):
    id: int
    agent_id: int
    thread_id: str
    created_at: str
    updated_at: str


class ConversationsResponse(BaseModel):
    conversations: list[Conversation]


class CreateConversationRequest(BaseModel):
    agent_id: int
    thread_id: str = None


class CreateConversationResponse(BaseModel):
    conversation: Conversation


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown."""
    # Startup
    try:
        initialize_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

    yield

    # Shutdown (if needed)
    logger.info("Application shutting down")


app = FastAPI(title="Find Me A Job API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Thread-ID"],  # Allow frontend to access the X-Thread-ID header
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


@app.get("/agents/{agent_id}/conversations", response_model=ConversationsResponse)
async def get_agent_conversations(agent_id: int):
    logger.debug(f"Conversations requested for agent {agent_id}")

    # Check if agent exists first
    if not agent_exists(agent_id):
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        conversations_data = list_conversations(agent_id)
        conversations = [
            Conversation(
                id=conv["id"],
                agent_id=conv["agent_id"],
                thread_id=conv["thread_id"],
                created_at=conv["created_at"],
                updated_at=conv["updated_at"],
            )
            for conv in conversations_data
        ]
        logger.info(
            f"Returning {len(conversations)} conversations for agent {agent_id}"
        )
        return ConversationsResponse(conversations=conversations)
    except Exception as e:
        logger.error(f"Error fetching conversations for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch conversations")


@app.post("/conversations", response_model=CreateConversationResponse, status_code=201)
async def create_new_conversation(request: CreateConversationRequest):
    logger.debug(f"Conversation creation requested for agent {request.agent_id}")

    # Check if agent exists first
    if not agent_exists(request.agent_id):
        logger.warning(f"Agent {request.agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        conversation_data = create_conversation(request.agent_id, request.thread_id)
        conversation = Conversation(
            id=conversation_data["id"],
            agent_id=conversation_data["agent_id"],
            thread_id=conversation_data["thread_id"],
            created_at=conversation_data["created_at"],
            updated_at=conversation_data.get(
                "updated_at", conversation_data["created_at"]
            ),
        )
        logger.info(
            f"Created new conversation with id {conversation.id} and thread_id '{conversation.thread_id}'"
        )
        return CreateConversationResponse(conversation=conversation)
    except Exception as e:
        logger.error(f"Error creating conversation: {e}")
        raise HTTPException(status_code=500, detail="Failed to create conversation")


@app.get("/conversations/{thread_id}/messages", response_model=MessagesResponse)
async def get_conversation_messages_endpoint(thread_id: str):
    logger.debug(f"Messages requested for thread {thread_id}")

    try:
        langchain_messages = get_messages_by_thread(thread_id)
        messages = []

        for i, msg in enumerate(langchain_messages):
            # Convert LangChain message to API format
            if hasattr(msg, "__class__"):
                role = msg.__class__.__name__.replace("Message", "").lower()
                if role == "human":
                    role = "user"
                elif role == "ai":
                    role = "assistant"

            messages.append(
                Message(
                    id=i,  # Use index as ID for API compatibility
                    agent_id=0,  # Would need to be fetched separately for exact agent_id
                    role=role,
                    content=msg.content,
                    created_at="",  # Would need to be fetched separately
                )
            )

        logger.info(f"Returning {len(messages)} messages for thread {thread_id}")
        return MessagesResponse(messages=messages)
    except Exception as e:
        logger.error(f"Error fetching messages for thread {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch messages")


@app.delete("/conversations/{thread_id}", status_code=204)
async def delete_conversation_endpoint(thread_id: str):
    logger.debug(f"Conversation deletion requested for thread: {thread_id}")

    # Check if conversation exists first
    conversation = get_conversation_by_thread(thread_id)
    if not conversation:
        logger.warning(f"Conversation {thread_id} not found")
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        deleted = delete_conversation(conversation["id"])
        if deleted:
            logger.info(f"Successfully deleted conversation with thread_id {thread_id}")
            return  # 204 No Content response
        else:
            logger.warning(f"Conversation {thread_id} could not be deleted")
            raise HTTPException(status_code=500, detail="Failed to delete conversation")
    except Exception as e:
        logger.error(f"Error deleting conversation {thread_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete conversation")


async def persist_from_queue(conversation_id: int, queue: asyncio.Queue):
    logger.info(
        f"BACKGROUND: Persistence task started for conversation {conversation_id}, awaiting items..."
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
            from langchain_core.messages import AIMessage

            ai_message = AIMessage(content=assistant_response)
            next_seq = get_next_sequence_number(conversation_id)
            save_message(conversation_id, ai_message, next_seq)
            logger.info(
                f"BACKGROUND: Assistant response saved successfully for conversation {conversation_id}"
            )
        except Exception as e:
            logger.error(f"BACKGROUND: Failed to save assistant response to DB: {e}")
    else:
        logger.warning(
            f"BACKGROUND: No assistant response to save for conversation {conversation_id}"
        )


@app.post("/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    logger.info(
        f"Chat request received with message length: {len(request.message)} for agent {request.agent_id}, thread: {request.thread_id}"
    )

    if not request.message:
        logger.warning("Empty message received in chat request")
        raise HTTPException(status_code=400, detail="Message must not be empty")

    if not agent_exists(request.agent_id):
        logger.warning(f"Agent {request.agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        # Get or create conversation
        conversation = get_or_create_conversation(request.agent_id, request.thread_id)
        conversation_id = conversation["id"]
        thread_id = conversation["thread_id"]

        logger.info(f"Using conversation {conversation_id} with thread_id {thread_id}")

        # Get conversation history
        historical_messages = get_conversation_messages(conversation_id)
        logger.info(f"Retrieved {len(historical_messages)} historical messages")

        # Save user message
        from langchain_core.messages import HumanMessage

        user_message = HumanMessage(content=request.message)
        next_seq = get_next_sequence_number(conversation_id)
        save_message(conversation_id, user_message, next_seq)
        logger.info(f"User message saved to conversation {conversation_id}")

    except Exception as e:
        logger.error(f"Error setting up conversation: {e}")
        raise HTTPException(status_code=500, detail="Failed to setup conversation")

    try:
        # Stream with conversation history
        original_streamer = stream_graph_events(request.message, historical_messages)
        persistence_queue = asyncio.Queue()
        background_tasks.add_task(
            persist_from_queue, conversation_id, persistence_queue
        )

        teed_generator = tee_stream_and_queue(original_streamer, persistence_queue)

        return EventSourceResponse(
            teed_generator,
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "X-Thread-ID": thread_id,  # Return thread_id in header for client
            },
        )
    except Exception as e:
        logger.error(f"Failed to initialize stream: {e}")
        raise HTTPException(
            status_code=500, detail="LLM service failed to start stream"
        )
