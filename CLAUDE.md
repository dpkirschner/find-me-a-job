# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AgentDeck** (find-me-a-job) is a local-first, AI-powered job search orchestrator that uses collaborative multi-agent systems to automate technical job hunting tasks. The system runs entirely locally to maintain privacy while providing an efficient, organized approach to job searching.

## Technology Stack

### Backend (Python)
- **FastAPI** - High-performance API server (`backend/app.py`)
- **SQLite** - Database with LangChain message storage (`backend/db.py`)
- **LangGraph** - Agent orchestration and workflow management (`agents/graph.py`)
- **LangChain Community** - LLM integrations (langchain-ollama)
- **Pydantic** - Data validation and serialization
- **SSE-Starlette** - Server-sent events for real-time streaming

### Frontend (TypeScript/React)
- **Next.js 15.4.6** - React framework with App Router (`frontend/`)
- **React 19.1.0** - Latest React with modern features
- **TypeScript 5** - Type safety
- **Tailwind CSS 4** - Styling system
- **React Markdown** - Markdown rendering with GFM support
- **Jest** - Frontend testing framework
- **ESLint** - Code linting

### Development Tools
- **Ruff** - Python linting and formatting (Python 3.11+ target)
- **pytest** - Python testing framework with async support
- **Make** - Build automation

## Repository Structure

```
/
├── frontend/         # Next.js frontend application
│   ├── app/          # Next.js App Router pages
│   │   ├── page.tsx  # Main chat interface
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── features/     # Feature-based organization
│   │   └── chat/     # Chat feature components, hooks, services
│   │       ├── components/     # React components
│   │       ├── hooks/         # Custom React hooks
│   │       ├── services/      # API service layer
│   │       └── types.ts       # TypeScript type definitions
│   ├── lib/          # Shared utilities
│   ├── package.json
│   └── tsconfig.json
├── backend/          # FastAPI backend service
│   ├── app.py        # Main API server with endpoints
│   └── db.py         # Database operations and LangChain integration
├── agents/           # Agent logic and graph orchestration
│   ├── __init__.py
│   ├── graph.py      # LangGraph implementation
│   └── sample.py     # Sample agent configurations
├── memory/           # Database and persistent storage
│   ├── db.sqlite     # SQLite database
│   └── prompts.md    # Agent prompts and templates
├── sql/              # Database schema and migrations
│   └── 0001_init.sql # Initial database schema
├── tests/            # Comprehensive test suite
│   ├── agents/       # Agent system tests
│   └── backend/      # Backend API tests
├── utils/            # Shared utilities
│   └── logger.py     # Logging configuration
├── docs/             # Project documentation
├── pyproject.toml    # Python project configuration
├── Makefile          # Build and development commands
└── CLAUDE.md         # This file
```

## Development Commands

Start the development environment:
```bash
# Backend server (port 8000)
make dev-backend

# Frontend UI (port 3000)
make dev-frontend

# Full development setup
make dev-backend & make dev-frontend
```

Code quality:
```bash
make lint         # Check Python code with ruff
make format       # Format Python code with ruff
make check        # Fix auto-fixable issues
make test         # Run pytest test suite
make validate     # Run format, lint, and test

# Frontend testing
cd frontend && npm test       # Run Jest tests
cd frontend && npm run test:watch  # Watch mode
```

## Current Architecture

### Database Design
- **SQLite with LangChain integration** - Messages stored as LangChain message objects
- **Agent management** - Agents with customizable system prompts (`backend/db.py:69-77`)
- **Conversation threads** - LangGraph-compatible thread management (`backend/db.py:146-157`)
- **Message persistence** - Full LangChain message types (Human, AI, System, Tool)
- **Automatic indexing** - Performance optimized with conversation and message indexes

### Agent System
- **Multi-agent support** - Create, update, and manage multiple agents with unique system prompts
- **LangGraph-based orchestration** - Manages agent workflows and state
- **GraphState** - TypedDict defining message flow (`message: str`, `reply: str`)
- **llm_node** - Core LLM processing using langchain-ollama
- **Streaming support** - Real-time token streaming via `astream_events`

### API Design
- **Agent Management** - Full CRUD operations for agents with system prompts
- **Conversation Management** - Thread-based conversation handling
- **POST /chat** - Main chat endpoint accepting `ChatRequest` with agent and thread IDs
- **GET /healthz** - Health check endpoint
- **CORS enabled** - Allows frontend on localhost:3000
- **SSE streaming** - Server-sent events for real-time responses
- **Error handling** - Proper HTTP status codes and error messages

### Frontend Features
- **Multi-agent UI** - Create, edit, and switch between different agents
- **Conversation management** - Persistent conversations with thread IDs
- **Real-time chat interface** - Streaming responses with proper message handling
- **Component architecture** - Feature-based organization with reusable components
- **Service layer** - Dedicated API services for agents, conversations, and chat
- **Custom hooks** - React hooks for state management (`useAgents`, `useChat`, `useConversations`)
- **Responsive design** - Tailwind CSS for mobile/desktop
- **Markdown rendering** - Full markdown support with GitHub Flavored Markdown
- **Testing coverage** - Comprehensive Jest test suite for components and services

## Code Style & Conventions

### Python
- **Ruff configuration** - Line length 88, Python 3.11+ target
- **Import organization** - First-party imports: `agents`, `backend`
- **Type hints** - Required for all function signatures with modern union syntax
- **Async/await** - Preferred for I/O operations
- **Error handling** - Proper exception handling with specific error types
- **Database patterns** - Context managers for connection handling

### TypeScript/React
- **Strict TypeScript** - Full type safety enabled with interface definitions
- **Functional components** - Use hooks pattern with custom hooks for logic
- **Feature-based architecture** - Organize by feature (chat) rather than file type
- **Service layer pattern** - Separate API calls from component logic
- **CSS-in-JS** - Tailwind classes for styling
- **Testing** - Jest with React Testing Library for component tests
- **ESLint** - Next.js recommended configuration

## Development Workflow

### Testing
- **pytest** - Python test runner with async support for backend
- **Jest** - Frontend testing with React Testing Library
- **Test structure** - Mirror source structure in `tests/` for backend, co-located for frontend
- **Coverage** - Tests for agents, backend APIs, database operations, and frontend components
- **Database testing** - Isolated test database for each test run

### Git Workflow
- **Main branch** - Primary development branch
- **Commit messages** - Descriptive, conventional format preferred
- **Pre-commit** - Run `make validate` before commits

## Key Integration Points

### LLM Integration
- **Ollama backend** - Local LLM serving via langchain-ollama
- **Connection handling** - Graceful fallback when LLM service unavailable
- **Streaming tokens** - Real-time response generation
- **Multi-agent prompting** - Custom system prompts per agent

### Frontend-Backend Communication
- **SSE protocol** - Server-sent events for streaming chat responses
- **JSON API** - RESTful endpoints with Pydantic validation
- **Agent management** - CRUD operations for agents and conversations
- **Thread-based conversations** - Persistent conversation state
- **Error propagation** - Proper error handling from backend to frontend

### Data Flow
- **Request flow** - Frontend → API → LangGraph → Ollama → Database
- **Message persistence** - All messages stored as LangChain objects in SQLite
- **State management** - React hooks manage UI state, backend manages conversation state
- **Real-time updates** - SSE streams for immediate response feedback

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