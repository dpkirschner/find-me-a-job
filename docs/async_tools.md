# Async Tools Architecture

## Overview

This document outlines the architecture for integrating asynchronous tools with the agent system in AgentDeck. The core challenge is bridging the gap between synchronous agent tool calls and asynchronous operations like web scraping.

## Current Architecture

### Agent System (`agents/graph.py`)
- **Simple LLM Graph**: `START → llm_node → END`
- **No Tool Calling**: Agents only process messages through ChatOllama
- **System Prompts**: Custom prompts per agent but no tool execution

### Research System
- **Background Jobs**: Async web scraping via `run_scrape_job()`
- **UI Polling**: Frontend polls job status for completion
- **Storage**: Results stored in ChromaDB + SQLite `research_notes`

## The Async Problem

**Agent Tool Expectations:**
```python
@tool
def research_url(url: str) -> str:
    # Agent expects immediate synchronous return
    return "content here"
```

**Current Background Jobs:**
```python
# Returns job_id, not content
job_id = create_background_job(agent_id, "scrape", {"url": url})
# Results available later via polling
```

**Core Issue**: Agents can't wait for async background jobs to complete within a single tool call.

## Proposed Solution: Dual-Path Architecture

### Path 1: Synchronous Agent Tools

**For Agent-Initiated Research:**
```python
@tool
async def research_url(url: str, agent_id: int) -> str:
    """Research URL and return content immediately for agent use."""
    try:
        # Direct call to crawl4ai_scrape (30s timeout)
        result = await crawl4ai_scrape(url)
        
        if result["success"]:
            # Store in ChromaDB immediately
            collection = get_agent_collection(agent_id)
            vector_id = str(uuid.uuid4())
            
            collection.add(
                ids=[vector_id],
                documents=[result["text"]],
                metadatas=[{
                    "agent_id": agent_id,
                    "url": url,
                    "title": result["title"]
                }]
            )
            
            # Store in database
            store_research_note(agent_id, vector_id, url, result["text"])
            
            # Return summary for agent
            preview = result["text"][:500] + "..." if len(result["text"]) > 500 else result["text"]
            return f"✓ Researched: {result['title']}\n\nContent preview:\n{preview}"
        else:
            return f"✗ Research failed for {url}: {result['error']}"
            
    except Exception as e:
        return f"✗ Research error for {url}: {str(e)}"

@tool
async def search_research(query: str, agent_id: int, limit: int = 3) -> str:
    """Search existing research notes for relevant content."""
    try:
        collection = get_agent_collection(agent_id)
        results = collection.query(
            query_texts=[query],
            n_results=limit
        )
        
        if results["documents"] and results["documents"][0]:
            summaries = []
            for i, (doc, metadata) in enumerate(zip(results["documents"][0], results["metadatas"][0])):
                preview = doc[:300] + "..." if len(doc) > 300 else doc
                summaries.append(f"{i+1}. {metadata['title']} ({metadata['url']})\n{preview}")
            
            return f"Found {len(summaries)} relevant research notes:\n\n" + "\n\n".join(summaries)
        else:
            return f"No existing research found for query: {query}"
            
    except Exception as e:
        return f"Search error: {str(e)}"
```

**Benefits:**
- Immediate results for agents
- All research appears in UI (shared storage)
- Agents can leverage existing research
- Simple integration with LangGraph

### Path 2: Background Jobs (Keep Existing)

**For UI-Initiated Research:**
- Manual URL research via ResearchPanel
- Long-running or complex scraping operations
- Polling interface for status updates
- Same storage destinations (ChromaDB + database)

## Implementation Plan

### Step 1: Enhanced Graph with Tools

**Update `agents/graph.py`:**
```python
from langchain_core.tools import tool
from agents.tools import crawl4ai_scrape
from backend.chroma_client import get_agent_collection
from backend.background import store_research_note

# Tool definitions (as above)

# Enhanced LLM node with tool binding
async def llm_node(state: GraphState) -> dict:
    messages = state["messages"]
    agent_id = state.get("agent_id")
    
    # Get agent system prompt
    if agent_id:
        agent = get_agent(agent_id)
        system_prompt = agent.get("system_prompt")
        if system_prompt and not isinstance(messages[0], SystemMessage):
            messages = [SystemMessage(content=system_prompt), *messages]
    
    # Bind tools to LLM
    tools = [research_url, search_research]
    llm = ChatOllama(model="gpt-oss").bind_tools(tools)
    
    response = await llm.ainvoke(messages)
    return {"messages": [response]}

# Tool execution node
async def tool_node(state: GraphState) -> dict:
    messages = state["messages"]
    last_message = messages[-1]
    agent_id = state.get("agent_id")
    
    tool_results = []
    for tool_call in last_message.tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        
        # Inject agent_id into tool calls
        if "agent_id" in tool_args:
            tool_args["agent_id"] = agent_id
            
        if tool_name == "research_url":
            result = await research_url(**tool_args)
        elif tool_name == "search_research":
            result = await search_research(**tool_args)
        else:
            result = f"Unknown tool: {tool_name}"
            
        tool_results.append(ToolMessage(content=result, tool_call_id=tool_call["id"]))
    
    return {"messages": tool_results}

# Conditional edge logic
def should_continue(state: GraphState) -> str:
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "end"

# Updated graph structure
graph_builder = StateGraph(GraphState)
graph_builder.add_node("llm_node", llm_node)
graph_builder.add_node("tool_node", tool_node)
graph_builder.add_edge(START, "llm_node")
graph_builder.add_conditional_edges("llm_node", should_continue, {"tools": "tool_node", "end": END})
graph_builder.add_edge("tool_node", "llm_node")
```

### Step 2: Enhanced System Prompts

**Update agent system prompts to include tool usage guidance:**
```
You are a job search assistant with access to research tools:

- research_url(url): Scrape and analyze web content from any URL
- search_research(query): Search your existing research notes

Use these tools to:
1. Research job postings, company information, and industry trends
2. Find relevant information from previously researched content
3. Gather context for answering user questions

Always cite sources when referencing researched content.
```

### Step 3: API Integration

**Update `backend/app.py` to support tool-enabled agents:**
- Existing research endpoints remain for UI
- Enhanced graph streaming supports tool calls
- Tool results appear in conversation history

### Step 4: Frontend Updates

**Research Panel Enhancement:**
- Show both manual and agent-initiated research
- Distinguish research sources (manual vs agent)
- Real-time updates when agents research content

## Benefits

### For Users
- **Autonomous Research**: Agents can research autonomously based on conversation
- **Unified Interface**: All research visible in single panel
- **Context Awareness**: Agents leverage previous research

### For Agents  
- **Immediate Results**: No waiting for background jobs
- **Rich Context**: Access to web content and existing research
- **Tool Chaining**: Can research multiple sources in single conversation

### For System
- **Dual Compatibility**: UI and agent paths coexist
- **Shared Storage**: Consistent data regardless of source
- **Scalable**: Background jobs still available for complex operations

## Considerations

### Performance
- **Timeout Handling**: 30-second timeout on crawl4ai_scrape
- **Error Recovery**: Graceful failure handling for unreachable URLs
- **Rate Limiting**: Consider implementing rate limits for agent tool calls

### Storage
- **Vector Limits**: Monitor ChromaDB collection sizes
- **Content Deduplication**: Avoid storing duplicate URL content
- **Cleanup**: Implement cleanup for old research notes

### Security
- **URL Validation**: Sanitize URLs before scraping
- **Content Filtering**: Filter sensitive or malicious content
- **Access Control**: Ensure agents only access their own research

## Migration Path

1. **Phase 1**: Implement synchronous tools alongside existing background jobs
2. **Phase 2**: Update agent system prompts to use research tools
3. **Phase 3**: Enhance UI to show agent-initiated research
4. **Phase 4**: Optimize performance and add advanced features

## Future Enhancements

### Advanced Tools
- **Multi-page Research**: Follow links and research related pages
- **Content Summarization**: AI-powered summarization of research
- **Fact Checking**: Cross-reference information across sources

### Intelligence
- **Research Planning**: Agents create research plans before execution
- **Source Prioritization**: Rank research sources by relevance
- **Incremental Research**: Build on previous research systematically

This architecture provides a robust foundation for agent-driven research while maintaining the flexibility of manual research operations.