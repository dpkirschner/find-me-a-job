"""
LangChain tool definitions that wrap the unified research service.
These tools are designed for use by agents in the LangGraph workflow.
"""

from langchain_core.tools import tool

from agents.research_service import AgentToolFormatter, ResearchService


@tool
async def research_url(url: str, agent_id: int) -> str:
    """
    Research URL and return content immediately for agent use.

    Args:
        url: The URL to research and scrape
        agent_id: The ID of the agent performing the research

    Returns:
        A formatted string with research results or error message
    """
    result = await ResearchService.research_url(agent_id, url)
    return AgentToolFormatter.format_research_result(result)


@tool
def search_research(query: str, agent_id: int, limit: int = 3) -> str:
    """
    Search existing research notes for relevant content.

    Args:
        query: The search query to find relevant research
        agent_id: The ID of the agent performing the search
        limit: Maximum number of results to return (default: 3)

    Returns:
        A formatted string with search results or message if no results found
    """
    result = ResearchService.search_research(agent_id, query, limit)
    return AgentToolFormatter.format_search_result(result)


# Export tools list for easy import
AGENT_TOOLS = [research_url, search_research]

# Create tools map for O(1) lookup by tool name
AGENT_TOOLS_MAP = {tool.name: tool for tool in AGENT_TOOLS}
