# agents/graph.py

from collections.abc import AsyncGenerator
from typing import TypedDict

import requests
from langchain_community.chat_models import ChatOllama
from langgraph.graph import END, START, StateGraph


class GraphState(TypedDict):
    message: str
    reply: str


async def llm_node(state: GraphState) -> dict:
    """Node that uses ChatOllama. The stream is tapped into by astream_events."""
    llm = ChatOllama(model="gpt-oss")
    response = await llm.ainvoke(state["message"])
    return {"reply": response.content}


graph_builder = StateGraph(GraphState)
graph_builder.add_node("llm_node", llm_node)
graph_builder.add_edge(START, "llm_node")
graph_builder.add_edge("llm_node", END)

graph = graph_builder.compile()


async def stream_graph_events(user_message: str) -> AsyncGenerator[dict, None]:
    """
    Runs the graph and streams back LLM tokens in the SSE format.
    """
    try:
        async for event in graph.astream_events(
            {"message": user_message}, version="v2"
        ):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if content := chunk.content:
                    yield {"event": "message", "data": content}

        yield {"event": "done", "data": "[DONE]"}

    except requests.exceptions.ConnectionError:
        raise
    except Exception as e:
        yield {"event": "error", "data": f"An error occurred: {e}"}
        yield {"event": "done", "data": "[DONE]"}
