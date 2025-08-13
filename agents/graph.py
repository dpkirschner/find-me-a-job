# agents/graph.py

from collections.abc import AsyncGenerator
from typing import Annotated

import requests
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from utils.logger import get_logger

logger = get_logger(__name__)


class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    agent_id: int | None


async def llm_node(state: GraphState) -> dict:
    """Node that uses ChatOllama with agent-specific system prompt."""
    messages = state["messages"]
    agent_id = state.get("agent_id")
    logger.debug(
        f"LLM node processing {len(messages)} messages for agent {agent_id}, last: {messages[-1].content[:50] if messages else 'None'}..."
    )

    try:
        # Get agent's system prompt if agent_id is provided
        if agent_id:
            from backend.db import get_agent

            agent = get_agent(agent_id)
            system_prompt = agent.get("system_prompt") if agent else None

            # Prepend system message if system prompt exists and not already present
            if system_prompt and (
                not messages or not isinstance(messages[0], SystemMessage)
            ):
                system_message = SystemMessage(content=system_prompt)
                messages = [system_message, *messages]
                logger.debug(
                    f"Added system prompt for agent {agent_id}: {system_prompt[:50]}..."
                )

        llm = ChatOllama(model="gpt-oss")
        logger.debug("ChatOllama instance created, invoking LLM")
        response = await llm.ainvoke(messages)
        logger.debug(f"LLM response received, content length: {len(response.content)}")
        return {"messages": [response]}
    except Exception as e:
        logger.error(f"Error in LLM node: {e}")
        raise


graph_builder = StateGraph(GraphState)
graph_builder.add_node("llm_node", llm_node)
graph_builder.add_edge(START, "llm_node")
graph_builder.add_edge("llm_node", END)

graph = graph_builder.compile()


async def stream_graph_events(
    user_message: str,
    agent_id: int,
    historical_messages: list[AnyMessage] | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Runs the graph and streams back LLM tokens in the SSE format.

    Args:
        user_message: Current user message
        agent_id: ID of the agent to use for system prompt
        historical_messages: Previous conversation messages for context
    """
    # Combine historical messages with new user message
    messages = historical_messages or []
    current_message = HumanMessage(content=user_message)
    all_messages = [*messages, current_message]

    logger.info(
        f"Starting graph streaming with {len(all_messages)} messages for agent {agent_id}, current: {user_message[:50]}..."
    )
    event_count = 0

    try:
        logger.debug("Beginning graph.astream_events")
        # Include agent_id in initial state
        initial_state = {"messages": all_messages, "agent_id": agent_id}
        async for event in graph.astream_events(initial_state, version="v2"):
            event_count += 1
            kind = event["event"]
            logger.debug(f"Event #{event_count} of kind: {kind}")

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if content := chunk.content:
                    logger.debug(f"Streaming content chunk: '{content}'")
                    yield {"event": "message", "data": content}

        logger.info(f"Graph streaming completed, processed {event_count} events")
        yield {"event": "done", "data": "[DONE]"}

    except requests.exceptions.ConnectionError as e:
        logger.error(f"Connection error during graph streaming: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during graph streaming: {e}")
        yield {"event": "error", "data": f"An error occurred: {e}"}
        yield {"event": "done", "data": "[DONE]"}
