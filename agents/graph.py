# agents/graph.py

from collections.abc import AsyncGenerator
from typing import TypedDict

import requests
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph

from utils.logger import get_logger

logger = get_logger(__name__)


class GraphState(TypedDict):
    message: str
    reply: str


async def llm_node(state: GraphState) -> dict:
    """Node that uses ChatOllama. The stream is tapped into by astream_events."""
    logger.debug(f"LLM node processing message: {state['message'][:50]}...")

    try:
        llm = ChatOllama(model="gpt-oss")
        logger.debug("ChatOllama instance created, invoking LLM")
        response = await llm.ainvoke(state["message"])
        logger.debug(f"LLM response received, content length: {len(response.content)}")
        return {"reply": response.content}
    except Exception as e:
        logger.error(f"Error in LLM node: {e}")
        raise


graph_builder = StateGraph(GraphState)
graph_builder.add_node("llm_node", llm_node)
graph_builder.add_edge(START, "llm_node")
graph_builder.add_edge("llm_node", END)

graph = graph_builder.compile()


async def stream_graph_events(user_message: str) -> AsyncGenerator[dict, None]:
    """
    Runs the graph and streams back LLM tokens in the SSE format.
    """
    logger.info(f"Starting graph streaming for message: {user_message[:50]}...")
    event_count = 0

    try:
        logger.debug("Beginning graph.astream_events")
        async for event in graph.astream_events(
            {"message": user_message}, version="v2"
        ):
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
