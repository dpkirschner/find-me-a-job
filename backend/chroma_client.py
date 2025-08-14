from pathlib import Path

import chromadb


def get_chroma_client():
    """Get a persistent ChromaDB client."""
    chroma_path = Path("memory/chroma")
    chroma_path.mkdir(parents=True, exist_ok=True)

    return chromadb.PersistentClient(path=str(chroma_path))


def get_agent_collection(agent_id: int):
    """Get or create a collection for a specific agent."""
    client = get_chroma_client()
    collection_name = f"agent_{agent_id}_research"

    # Get or create collection - ChromaDB raises different exceptions
    try:
        collection = client.get_collection(name=collection_name)
    except Exception:
        # Collection doesn't exist, create it
        try:
            collection = client.create_collection(
                name=collection_name,
                metadata={"agent_id": agent_id, "type": "research"},
            )
        except Exception as e:
            # If creation also fails, try to get it again (race condition)
            try:
                collection = client.get_collection(name=collection_name)
            except Exception:
                raise RuntimeError(
                    f"Failed to get or create collection {collection_name}: {e!s}"
                )

    return collection
