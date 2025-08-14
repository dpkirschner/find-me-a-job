# agents/sample.py
import asyncio
from collections.abc import AsyncGenerator


async def stream_graph_events(user_message: str) -> AsyncGenerator[dict, None]:
    """
    A true async generator. The `await asyncio.sleep()` is critical as it
    pauses execution and allows the server to send the yielded chunk.
    """
    words = ["This ", "is ", "a ", "true ", "asynchronous ", "stream.", "[DONE]"]

    yield {"event": "metadata", "data": '{"format": "markdown"}'}

    for word in words:
        yield {"event": "message", "data": word}
        # This is the line that makes it work!
        await asyncio.sleep(1)
