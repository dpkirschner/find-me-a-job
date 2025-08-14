# agents/graph.py

from collections.abc import AsyncGenerator
from typing import Annotated

import requests
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from agents.agent_tools import AGENT_TOOLS_MAP
from agents.llm_factory import get_llm_with_tools
from utils.logger import get_logger

logger = get_logger(__name__)


class GraphState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


async def llm_node(state: GraphState) -> dict:
    """Node that uses ChatOllama with tool binding."""
    messages = state["messages"]
    logger.debug(
        f"LLM node processing {len(messages)} messages, last: {messages[-1].content[:50] if messages else 'None'}..."
    )

    try:
        # Get configured LLM with tools from factory
        llm_with_tools = get_llm_with_tools()

        logger.debug("LLM instance created with tools, invoking LLM")
        response = await llm_with_tools.ainvoke(messages)
        logger.debug(f"LLM response received, content length: {len(response.content)}")
        return {"messages": [response]}
    except Exception as e:
        logger.error(f"Error in LLM node: {e}")
        raise


async def tool_node(state: GraphState) -> dict:
    """Node that executes tool calls from the LLM."""
    messages = state["messages"]
    last_message = messages[-1]

    logger.debug("Tool node processing tool calls")

    tool_results = []

    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        for tool_call in last_message.tool_calls:
            tool_name = tool_call["name"]
            tool_args = tool_call["args"]
            tool_call_id = tool_call["id"]

            logger.debug(f"Executing tool: {tool_name} with args: {tool_args}")

            try:
                # Find and execute the tool using O(1) dictionary lookup
                tool_function = AGENT_TOOLS_MAP.get(tool_name)

                if tool_function:
                    # Execute the tool
                    if hasattr(tool_function, "acall"):
                        result = await tool_function.acall(tool_args)
                    else:
                        result = await tool_function.ainvoke(tool_args)
                else:
                    result = f"Unknown tool: {tool_name}"

                logger.debug(f"Tool {tool_name} executed successfully")
                tool_results.append(
                    ToolMessage(content=str(result), tool_call_id=tool_call_id)
                )

            except Exception as e:
                logger.error(f"Error executing tool {tool_name}: {e}")
                error_result = f"Error executing {tool_name}: {e!s}"
                tool_results.append(
                    ToolMessage(content=error_result, tool_call_id=tool_call_id)
                )

    return {"messages": tool_results}


def should_continue(state: GraphState) -> str:
    """Determine whether to continue to tools or end the conversation."""
    last_message = state["messages"][-1]

    # Check if the last message has tool calls
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        logger.debug("Tool calls detected, routing to tool node")
        return "tools"

    logger.debug("No tool calls, ending conversation")
    return "end"


graph_builder = StateGraph(GraphState)
graph_builder.add_node("llm_node", llm_node)
graph_builder.add_node("tool_node", tool_node)

# Set up the flow: START -> llm_node -> (tools OR end)
graph_builder.add_edge(START, "llm_node")
graph_builder.add_conditional_edges(
    "llm_node", should_continue, {"tools": "tool_node", "end": END}
)
# After tools, go back to llm_node for response
graph_builder.add_edge("tool_node", "llm_node")

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
    try:
        # Fetch agent data upfront
        from backend.db import get_agent

        agent = get_agent(agent_id)
        system_prompt = agent.get("system_prompt") if agent else None

        # Prepare messages list with system prompt (if exists), historical messages, and new user message
        messages = []

        # Add system prompt if it exists and not already present in historical messages
        if system_prompt and (
            not historical_messages
            or not isinstance(historical_messages[0], SystemMessage)
        ):
            system_message = SystemMessage(content=system_prompt)
            messages.append(system_message)
            logger.debug(
                f"Added system prompt for agent {agent_id}: {system_prompt[:50]}..."
            )

        # Add historical messages
        if historical_messages:
            messages.extend(historical_messages)

        # Add current user message
        current_message = HumanMessage(content=user_message)
        messages.append(current_message)

        logger.info(
            f"Starting graph streaming with {len(messages)} messages for agent {agent_id}, current: {user_message[:50]}..."
        )
        event_count = 0

        logger.debug("Beginning graph.astream_events")
        # Pass prepared messages to initial state (no longer need agent_id in state)
        initial_state = {"messages": messages}
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
