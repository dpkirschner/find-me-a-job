### Milestone 1 — The Core Chat Loop

Goal: Get a single, stateless agent running that you can chat with from a basic web UI, proving end-to-end from the browser to a local LLM (Ollama).

Scope
- Included: One agent, no tools, no database, no persistence. Basic UI + API + local model.
- Excluded: Memory, vector DB, background jobs, multi-agent, auth, deployment.

Acceptance Criteria (Definition of Done)
- You can type a message in the web UI and see a streamed reply from the local LLM.
- The system runs locally on macOS with Ollama and the `llama3.1:8b` model.
- The backend exposes a single `/chat` endpoint that the UI calls.
- Agent is stateless; only the current user message is considered.

Recommended Local Dev Targets
- macOS (Darwin) with Homebrew
- Python 3.10+ (recommended 3.11)
- Node.js LTS (>=18)
- Ollama installed with `llama3.1:8b` pulled

Directory Layout (after this milestone)
- `server/app.py` — FastAPI app exposing `/chat`
- `agents/graph.py` — minimal LangGraph graph for one agent using ChatOllama
- `ui/` — Next.js app with a single chat page

High-Level Architecture
- Browser (Next.js UI) → FastAPI `/chat` → LangGraph → ChatOllama → Ollama runtime → stream tokens back to UI

Setup and Tasks (junior-friendly)

1) System prerequisites [1–2h]
- Install Homebrew (skip if installed):
  - `bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- Install Python and Node:
  - `brew install python@3.11 node` (or use existing versions >= 3.10 / 18)
- Create and activate Python venv in project root:
  - `python3 -m venv venv`
  - `source venv/bin/activate`

2) Install and prepare Ollama [15–30m]
- Install Ollama: `brew install ollama`
- Start the Ollama service: `ollama serve` (keep running in a terminal)
- In a separate terminal, pull the model: `ollama pull llama3.1:8b`
- Quick smoke test: `ollama run llama3.1:8b` then type a short prompt, confirm it responds.

3) Backend scaffold (FastAPI) [1–2h]
- Create `requirements.txt` with:
  - `fastapi`
  - `uvicorn[standard]`
  - `langchain`
  - `langgraph`
  - `langchain-community`
  - `pydantic`
  - `sse-starlette` (for streaming via SSE)
  - `httpx` (optional utility)
- Create `server/app.py` that:
  - Instantiates FastAPI
  - Enables CORS for `http://localhost:3000`
  - Exposes `GET /healthz` returning `{ status: "ok" }`
  - Exposes `POST /chat` which accepts `{ message: string }`
  - Implements streaming response using `EventSourceResponse` (SSE) or a streaming generator
  - Returns tokens as they arrive and a final `[DONE]` event
- Add a `make dev-server` or `task` script to run: `uvicorn server.app:app --reload --host 0.0.0.0 --port 8000`
- Manual test with `curl` (non-streamed smoke):
  - `curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{"message":"Hello"}'`

4) Minimal agent (LangGraph + ChatOllama) [1–2h]
- Create `agents/graph.py` with a minimal graph that:
  - Accepts an input message
  - Uses LangChain `ChatOllama` (from `langchain_community.chat_models`) to generate a reply
  - Returns the reply text (no tools, no memory)
- In `server/app.py`, wire the `/chat` handler to call the graph and stream tokens
- Error handling: If Ollama not running, return a clear 503-ish message

5) Frontend scaffold (Next.js) [2–3h]
- Create Next.js app in `ui/` (Router: App Router or Pages Router is fine)
  - `npx create-next-app@latest ui --ts --eslint --use-npm`
- Configure dev proxy or CORS
  - Option A: Keep backend on `http://localhost:8000` and enable CORS in FastAPI
  - Option B: Next.js API route as a proxy to FastAPI (optional)
- Create a single page (e.g., `ui/app/page.tsx` or `ui/pages/index.tsx`) with:
  - Text input and Send button
  - A messages area for displaying the conversation (user + assistant)
  - When user submits, call `/chat` and display streamed tokens as they arrive
- Streaming on the client:
  - Use `EventSource` (SSE) if the server uses SSE; append tokens to the UI as `message` events
  - On `[DONE]`, close the stream and finalize the assistant message
- Keep the UI minimal and unstyled for now; a simple layout is sufficient

6) Local run and manual QA [30–60m]
- Terminal A: `ollama serve`
- Terminal B: `source venv/bin/activate && pip install -r requirements.txt && uvicorn server.app:app --reload --port 8000`
- Terminal C: `cd ui && npm install && npm run dev`
- Navigate to `http://localhost:3000`
- Type a message like “Explain the difference between REST and GraphQL.” Confirm streaming works end-to-end.

7) Developer experience niceties [optional, 30m]
- Add VS Code settings or EditorConfig
- Add `make` or `npm` scripts for one-command start of backend and frontend
- README quickstart section specific to Milestone 1

Detailed Checklist
- [ ] Python venv created and activated
- [ ] Backend dependencies installed via `requirements.txt`
- [ ] Ollama installed and `llama3.1:8b` model pulled
- [ ] `server/app.py` with `/healthz` and `/chat` implemented
- [ ] Minimal `agents/graph.py` with `ChatOllama` wired
- [ ] Streaming enabled from backend to client (SSE or similar)
- [ ] Next.js app in `ui/` with a basic chat page
- [ ] UI displays tokens incrementally as they stream
- [ ] Manual QA passes; reasonable latency; no crashes on empty input

Non-Goals and Guardrails
- Do not store messages in a DB (stateless only)
- Do not add tools, scraping, or vector DB yet
- Keep the agent simple; focus on connectivity and streaming

Common Pitfalls (and fixes)
- Ollama not running → Start `ollama serve` first
- Model not found → Run `ollama pull llama3.1:8b`
- CORS errors → Ensure FastAPI CORS allows `http://localhost:3000`
- Streaming stalled → Verify SSE headers and that the client consumes events progressively
- Env conflicts → Use venv, pin versions in `requirements.txt`

Time Estimate
- 1 full working day (6–8 hours) for a junior engineer

What to Demo
- Start backend and UI
- Show typing a message and receiving a streamed response
- Show logs on the backend to prove calls flow through the agent graph
