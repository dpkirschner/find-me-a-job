# main.py

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import stream_graph_events
from backend.background import (
    create_background_job,
    get_agent_research_notes,
    get_job_status,
    run_scrape_job,
)
from backend.db import (
    agent_exists,
    create_agent,
    # New conversation-based functions
    create_conversation,
    delete_agent,
    delete_conversation,
    get_agent,
    get_conversation_by_thread,
    get_conversation_messages,
    get_messages_by_thread,
    get_next_sequence_number,
    get_or_create_conversation,
    initialize_database,
    list_agents,
    list_conversations,
    save_message,
    update_agent,
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
    system_prompt: str | None = None


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
    system_prompt: str | None = None


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


class UpdateAgentRequest(BaseModel):
    name: str | None = None
    system_prompt: str | None = None


class ExecuteToolRequest(BaseModel):
    tool: str
    url: str


class JobResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    agent_id: int
    task_name: str
    status: str
    payload: dict
    result: dict
    created_at: str
    completed_at: str | None = None


class ResearchNote(BaseModel):
    id: int
    vector_id: str
    source_url: str
    content: str
    created_at: str


class ResearchNotesResponse(BaseModel):
    notes: list[ResearchNote]


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
        agents = [
            Agent(
                id=agent["id"], name=agent["name"], system_prompt=agent["system_prompt"]
            )
            for agent in agents_data
        ]
        logger.info(f"Returning {len(agents)} agents")
        return AgentsResponse(agents=agents)
    except Exception as e:
        logger.error(f"Error fetching agents: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch agents")


@app.get("/agents/{agent_id}", response_model=Agent)
async def get_agent_by_id(agent_id: int):
    logger.debug(f"Agent requested for id: {agent_id}")

    agent_data = get_agent(agent_id)
    if not agent_data:
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        agent = Agent(
            id=agent_data["id"],
            name=agent_data["name"],
            system_prompt=agent_data["system_prompt"],
        )
        logger.info(f"Returning agent {agent.id}")
        return agent
    except Exception as e:
        logger.error(f"Error fetching agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch agent")


@app.post("/agents", response_model=CreateAgentResponse, status_code=201)
async def create_new_agent(request: CreateAgentRequest):
    logger.debug(f"Agent creation requested with name: {request.name}")
    try:
        agent_data = create_agent(request.name, request.system_prompt)
        agent = Agent(
            id=agent_data["id"],
            name=agent_data["name"],
            system_prompt=agent_data["system_prompt"],
        )
        logger.info(f"Created new agent with id {agent.id} and name '{agent.name}'")
        return CreateAgentResponse(agent=agent)
    except Exception as e:
        logger.error(f"Error creating agent: {e}")
        raise HTTPException(status_code=500, detail="Failed to create agent")


@app.put("/agents/{agent_id}", response_model=Agent)
async def update_existing_agent(agent_id: int, request: UpdateAgentRequest):
    logger.debug(f"Agent update requested for id: {agent_id}")

    # Check if agent exists first
    if not agent_exists(agent_id):
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        # Handle the case where fields are not provided vs explicitly set to None
        kwargs = {}
        if request.name is not None:
            kwargs["name"] = request.name
        if (
            hasattr(request, "system_prompt")
            and "system_prompt" in request.model_fields_set
        ):
            kwargs["system_prompt"] = request.system_prompt

        agent_data = update_agent(agent_id, **kwargs)
        if not agent_data:
            logger.warning(f"Agent {agent_id} could not be updated")
            raise HTTPException(status_code=500, detail="Failed to update agent")

        agent = Agent(
            id=agent_data["id"],
            name=agent_data["name"],
            system_prompt=agent_data["system_prompt"],
        )
        logger.info(f"Updated agent {agent.id}")
        return agent
    except Exception as e:
        logger.error(f"Error updating agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update agent")


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


@app.post(
    "/agents/{agent_id}/execute-tool", response_model=JobResponse, status_code=202
)
async def execute_agent_tool(
    agent_id: int, request: ExecuteToolRequest, background_tasks: BackgroundTasks
):
    """Execute a tool for an agent in the background."""
    logger.debug(f"Tool execution requested for agent {agent_id}: {request.tool}")

    # Check if agent exists
    if not agent_exists(agent_id):
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    # Validate tool and URL
    if request.tool != "crawl4ai_scrape":
        logger.warning(f"Unknown tool: {request.tool}")
        raise HTTPException(status_code=400, detail="Unknown tool")

    if not request.url.startswith(("http://", "https://")):
        logger.warning(f"Invalid URL: {request.url}")
        raise HTTPException(status_code=400, detail="Invalid URL format")

    try:
        # Create background job
        job_id = create_background_job(
            agent_id=agent_id, task_name=request.tool, payload={"url": request.url}
        )

        # Schedule the background task
        background_tasks.add_task(run_scrape_job, job_id, agent_id, request.url)

        logger.info(f"Scheduled {request.tool} job {job_id} for agent {agent_id}")
        return JobResponse(job_id=job_id)

    except Exception as e:
        logger.error(f"Error creating background job: {e}")
        raise HTTPException(status_code=500, detail="Failed to create background job")


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status_endpoint(job_id: str):
    """Get the status of a background job."""
    logger.debug(f"Job status requested for: {job_id}")

    try:
        job_data = get_job_status(job_id)
        if not job_data:
            logger.warning(f"Job {job_id} not found")
            raise HTTPException(status_code=404, detail="Job not found")

        return JobStatusResponse(**job_data)

    except Exception as e:
        logger.error(f"Error fetching job status for {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch job status")


@app.get("/agents/{agent_id}/research", response_model=ResearchNotesResponse)
async def get_agent_research(agent_id: int, limit: int = 20):
    """Get research notes for an agent."""
    logger.debug(f"Research notes requested for agent {agent_id}")

    # Check if agent exists
    if not agent_exists(agent_id):
        logger.warning(f"Agent {agent_id} not found")
        raise HTTPException(status_code=404, detail="Agent not found")

    try:
        notes_data = get_agent_research_notes(agent_id, limit)
        notes = [
            ResearchNote(
                id=note["id"],
                vector_id=note["vector_id"],
                source_url=note["source_url"],
                content=note["content"],
                created_at=note["created_at"],
            )
            for note in notes_data
        ]

        logger.info(f"Returning {len(notes)} research notes for agent {agent_id}")
        return ResearchNotesResponse(notes=notes)

    except Exception as e:
        logger.error(f"Error fetching research notes for agent {agent_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch research notes")


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
        original_streamer = stream_graph_events(
            request.message, request.agent_id, historical_messages
        )
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
