"""
LLM factory for centralized LLM configuration and instantiation.
"""

from langchain_ollama import ChatOllama

from agents.agent_tools import AGENT_TOOLS


def get_llm_with_tools():
    """
    Create and configure a ChatOllama LLM instance with tools bound.

    Returns:
        ChatOllama instance with tools bound if available, otherwise plain LLM
    """
    # Create LLM instance - TODO: extract model to config file
    llm = ChatOllama(model="gpt-oss")

    # Bind tools to the LLM if tools are available
    if AGENT_TOOLS:
        return llm.bind_tools(AGENT_TOOLS)
    else:
        return llm
