# main.py

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from agents.graph import stream_graph_events
from utils.logger import get_logger

logger = get_logger(__name__)


class ChatRequest(BaseModel):
    message: str


app = FastAPI(title="Find Me A Job API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    logger.debug("Health check requested")
    return {"status": "ok"}


@app.post("/chat")
async def chat(request: ChatRequest):
    logger.info(f"Chat request received with message length: {len(request.message)}")

    if not request.message:
        logger.warning("Empty message received in chat request")
        raise HTTPException(status_code=400, detail="Message must not be empty")

    logger.debug(f"Starting graph streaming for message: {request.message[:50]}...")
    streamer = stream_graph_events(request.message)

    try:
        logger.debug("Getting first event from stream")
        first_event = await streamer.__anext__()
        logger.debug(f"First event received: {first_event}")
    except StopAsyncIteration:
        logger.warning("Stream ended immediately with no events")
        return EventSourceResponse(iter([]))
    except (ConnectionError, requests.exceptions.ConnectionError) as e:
        logger.error(f"LLM connection error: {e}")
        raise HTTPException(status_code=503, detail="LLM service is unavailable")
    except Exception as e:
        logger.error(f"Unexpected error getting first event: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    async def event_generator():
        logger.debug("Starting event generator")
        event_count = 0
        try:
            yield first_event
            event_count += 1

            async for event in streamer:
                event_count += 1
                logger.debug(f"Yielding event #{event_count}: {event}")
                yield event

        except Exception as e:
            logger.error(f"Error in event generator after {event_count} events: {e}")
            yield {"event": "error", "data": f"Stream error: {e}"}
        finally:
            logger.info(f"Event generator completed, total events: {event_count}")

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
