# AgentDeck

**AgentDeck** is a local-first, AI-powered command center designed to streamline and automate the modern technical job search. It acts as a personal team of AI agents that handle the repetitive and time-consuming tasks of job hunting, allowing you to focus on what matters: landing the right role.

## Problem & Solution

The modern job search is a disorganized and laborious process. Professionals spend countless hours searching for roles, researching companies, tailoring resumes, and writing unique cover letters for each application.

AgentDeck solves this with a collaborative, multi-agent system that runs entirely on your local machine. You interact with a lead **Orchestrator** agent that manages your entire application pipeline by intelligently delegating tasks to specialized agents:

- **Researcher** agent: Automatically scrapes company websites and job descriptions to gather key insights
- **Writer** agent: Takes research and your base resume to generate tailored drafts and unique cover letters

## Key Features

- **Application Dashboard**: Kanban-style board to track every job application from "Identified" to "Applied"
- **Collaborative AI Agents**: Persistent team of agents (Orchestrator, Researcher, Writer) that work together
- **Automated Research**: One-click deep dives into companies and job roles using web scraping
- **Tailored Document Generation**: AI-powered creation of customized resumes and cover letters
- **Persistent & Private Memory**: All data stored locally in SQLite and ChromaDB for complete privacy

## Technology Stack

- **Local AI Model**: Ollama serving Llama 3.1 model
- **Agent Orchestration**: LangGraph for multi-agent collaboration
- **Backend API**: FastAPI (Python) for high-performance server
- **Web Scraping**: Playwright for handling modern, dynamic websites
- **Database**: SQLite for relational data, ChromaDB for vector-based memory
- **Frontend UI**: Next.js (React) for responsive dashboard

## Development Roadmap

### Milestone 1: Core Chat Loop
- Setup Ollama and basic FastAPI server
- Simple LangGraph agent with minimal Next.js UI
- **Outcome**: Basic conversation with local LLM

### Milestone 2: Persistence & State  
- Integrate SQLite database
- Multi-agent tabbed interface
- **Outcome**: Persistent conversation history per agent

### Milestone 3: First Tool & Background Jobs
- Add Playwright web scraping and ChromaDB
- Implement background task execution
- **Outcome**: Asynchronous research capabilities

### Milestone 4: Application Dashboard
- Central applications table and dashboard UI
- Application-centric workflow with Orchestrator
- **Outcome**: Job application tracking system

### Milestone 5: Multi-Agent Collaboration
- True agent delegation and workflow coordination
- Complete research → writing pipeline
- **Outcome**: Fully collaborative multi-agent system

### Milestone 6: Polish & Scale
- Optional Celery/Redis upgrade
- Enhanced UI/UX and error handling
- **Outcome**: Production-ready job search assistant

## Database Schema

The system uses SQLite with the following core tables:
- `applications`: Central hub for job opportunity lifecycle
- `agents`: AI personas that perform specific tasks
- `conversations`: Message threads tied to applications and agents
- `messages`: Individual chat messages within conversations
- `research_notes`: Structured research with vector embeddings
- `generated_documents`: Track AI-generated resumes and cover letters
- `background_jobs`: Async task monitoring and debugging

Application statuses flow through: `identified` → `researching` → `drafting` → `applied` → `interviewing` → `archived`
