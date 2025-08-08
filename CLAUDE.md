# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AgentDeck** (find-me-a-job) is a local-first, AI-powered job search orchestrator that uses collaborative multi-agent systems to automate technical job hunting tasks. The system runs entirely locally to maintain privacy while providing an efficient, organized approach to job searching.

## Technology Stack

### Backend (Python)
- **FastAPI** - High-performance API server (`backend/app.py`)
- **LangGraph** - Agent orchestration and workflow management (`agents/graph.py`)
- **LangChain Community** - LLM integrations (currently ChatOllama with gpt-oss model)
- **Pydantic** - Data validation and serialization
- **SSE-Starlette** - Server-sent events for real-time streaming

### Frontend (TypeScript/React)
- **Next.js 15.4.6** - React framework with App Router (`frontend/`)
- **React 19.1.0** - Latest React with modern features
- **TypeScript 5** - Type safety
- **Tailwind CSS 4** - Styling system
- **ESLint** - Code linting

### Development Tools
- **Ruff** - Python linting and formatting
- **pytest** - Python testing framework
- **Make** - Build automation

## Repository Structure

```
/
├── frontend/         # Next.js frontend application
│   ├── app/
│   │   ├── page.tsx  # Main chat interface
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── __tests__ # Frontend tests
│   ├── package.json
│   └── tsconfig.json
├── backend/          # FastAPI backend service
│   └── app.py        # Main API server with /chat endpoint
├── agents/           # Agent logic and graph orchestration
│   ├── __init__.py
│   └── graph.py      # LangGraph implementation
├── tests/            # Backend/integration tests
│   ├── agents/
│   └── backend/
├── docs/             # Project documentation
├── pyproject.toml    # Python project configuration
├── Makefile          # Build commands
└── CLAUDE.md         # This file
```

## Development Commands

Start the development environment:
```bash
# Backend server (port 8000)
make dev-server

# Frontend UI (port 3000)
make dev-frontend

# Full development setup
make dev-server & make dev-frontend
```

Code quality:
```bash
make lint         # Check Python code with ruff
make format       # Format Python code with ruff
make check        # Fix auto-fixable issues
make test         # Run pytest test suite
make validate     # Run format, lint, and test
```

## Current Architecture

### Agent System
- **LangGraph-based orchestration** - Manages agent workflows and state
- **GraphState** - TypedDict defining message flow (`message: str`, `reply: str`)
- **llm_node** - Core LLM processing using ChatOllama with gpt-oss model
- **Streaming support** - Real-time token streaming via `astream_events`

### API Design
- **POST /chat** - Main chat endpoint accepting `ChatRequest`
- **GET /healthz** - Health check endpoint
- **CORS enabled** - Allows frontend on localhost:3000
- **SSE streaming** - Server-sent events for real-time responses
- **Error handling** - Proper HTTP status codes and error messages

### Frontend Features
- **Real-time chat interface** - Streaming responses with proper message handling
- **Responsive design** - Tailwind CSS for mobile/desktop
- **Message persistence** - Client-side state management
- **Stop generation** - User can abort long responses
- **Control token handling** - Filters out `[DONE]` and similar control tokens
- **Debug logging** - Comprehensive logging system (currently disabled in frontend/app/page.tsx:8-11)

## Code Style & Conventions

### Python
- **Ruff configuration** - Line length 88, Python 3.8+ target
- **Import organization** - First-party imports: `agents`, `server`
- **Type hints** - Required for all function signatures
- **Async/await** - Preferred for I/O operations
- **Error handling** - Proper exception handling with specific error types

### TypeScript/React
- **Strict TypeScript** - Full type safety enabled
- **Functional components** - Use hooks pattern
- **CSS-in-JS** - Tailwind classes for styling
- **ESLint** - Next.js recommended configuration

## Development Workflow

### Testing
- **pytest** - Python test runner with async support
- **Test structure** - Mirror source structure in `tests/`
- **Coverage** - Tests for both agents and server components

### Git Workflow
- **Main branch** - Primary development branch
- **Commit messages** - Descriptive, conventional format preferred
- **Pre-commit** - Run `make validate` before commits

## Key Integration Points

### LLM Integration
- **Ollama backend** - Local LLM serving (gpt-oss model)
- **Connection handling** - Graceful fallback when LLM service unavailable
- **Streaming tokens** - Real-time response generation

### Frontend-Backend Communication
- **SSE protocol** - Server-sent events for streaming
- **JSON API** - RESTful endpoints with Pydantic validation
- **Error propagation** - Proper error handling from backend to frontend

## 🚨 CRITICAL DEVELOPMENT GUIDELINES 🚨

**MUST DO BEFORE ANY CODE CHANGES:**
1. **Read this entire file first**
2. **Confirm the overall implementation approach with the user**
3. **Get explicit approval before writing any code**

**REQUIRED PROCESS - NO EXCEPTIONS:**
- **Implementation Confirmation**: ALWAYS confirm the overall implementation approach before writing any code. Discuss the plan first to ensure alignment.

## Other Development Guidelines

These instructions should be followed in every conversation:

- **Type Error Handling**: Don't use `type:ignore` when fixing type errors unless given explicit instructions to do so. Instead, properly address the underlying type issues.