from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langchain_community.chat_models import ChatOllama


class State(TypedDict):
    message: str
    reply: str


def llm_node(state: State) -> State:
    """Node that uses ChatOllama to generate a reply to the input message."""
    llm = ChatOllama(model="gpt-oss")  # Default model, can be configured
    
    response = llm.invoke([{"role": "user", "content": state["message"]}])
    
    return {"reply": response.content}


# Build the graph
graph_builder = StateGraph(State)
graph_builder.add_node("llm_node", llm_node)
graph_builder.add_edge(START, "llm_node")
graph_builder.add_edge("llm_node", END)

# Compile the graph
graph = graph_builder.compile()


def run_graph(input_message: str) -> str:
    """Run the graph with an input message and return the reply."""
    result = graph.invoke({"message": input_message})
    return result["reply"]