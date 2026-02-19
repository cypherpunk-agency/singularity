#!/usr/bin/env python3
"""
Singularity Memory Search Service
Vector search implementation using SQLite + sentence-transformers

Supports multiple modes:
- MCP server (for Claude CLI integration)
- HTTP server (for control plane API)
- CLI (for testing and cron jobs)
"""

import os
import sys
import json
import sqlite3
import hashlib
import asyncio
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Optional

# Configuration
APP_DIR = Path(os.environ.get("APP_DIR", "/app"))
AGENT_DIR = APP_DIR / "agent"
STATE_DIR = APP_DIR / "state"
MEMORY_DB = STATE_DIR / "memory.db"
MEMORY_DIR = AGENT_DIR / "memory"
EXTRA_SCAN_DIRS = [
    Path(d.strip()) for d in os.environ.get("EXTRA_SCAN_DIRS", "").split(":")
    if d.strip()
]

# Chunking configuration
CHUNK_SIZE = 400  # tokens (approximate)
CHUNK_OVERLAP = 80  # tokens

# Embedding model
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 dimension

# Lazy-loaded model
_model = None


def get_model():
    """Lazy load the sentence transformer model."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def init_db(conn: sqlite3.Connection):
    """Initialize the database schema."""
    # Try to load sqlite-vec extension
    try:
        conn.enable_load_extension(True)
        for ext_path in [
            "vec0",
            "/usr/lib/sqlite3/vec0",
            "/usr/local/lib/sqlite3/vec0",
        ]:
            try:
                conn.load_extension(ext_path)
                break
            except sqlite3.OperationalError:
                continue
    except Exception:
        pass  # Will fall back to manual similarity

    conn.executescript("""
        -- Document chunks table
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            embedding BLOB,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(file_path, chunk_index)
        );

        -- File tracking for incremental updates
        CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            indexed_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path);
        CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(file_hash);
    """)
    conn.commit()


def get_file_hash(path: Path) -> str:
    """Get MD5 hash of file contents."""
    return hashlib.md5(path.read_bytes()).hexdigest()


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []

    words_per_chunk = int(chunk_size / 1.3)
    words_overlap = int(overlap / 1.3)

    start = 0
    while start < len(words):
        end = start + words_per_chunk
        chunk_words = words[start:end]

        if chunk_words:
            chunks.append(" ".join(chunk_words))

        start = end - words_overlap
        if start >= len(words):
            break

    return chunks


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a list of texts."""
    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    return embeddings.tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    import math

    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot_product / (norm_a * norm_b)


def index_file(conn: sqlite3.Connection, file_path: Path, relative_root: Path = AGENT_DIR) -> bool:
    """Index a single file into the database."""
    file_hash = get_file_hash(file_path)
    rel_path = str(file_path.relative_to(relative_root))

    cursor = conn.execute(
        "SELECT hash FROM files WHERE path = ?",
        (rel_path,)
    )
    row = cursor.fetchone()

    if row and row[0] == file_hash:
        return False  # Already indexed

    content = file_path.read_text(encoding="utf-8", errors="ignore")
    chunks = chunk_text(content)

    if not chunks:
        return False

    embeddings = embed_texts(chunks)

    conn.execute("DELETE FROM chunks WHERE file_path = ?", (rel_path,))

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        embedding_blob = json.dumps(embedding).encode()
        conn.execute(
            """
            INSERT INTO chunks (file_path, file_hash, chunk_index, content, embedding)
            VALUES (?, ?, ?, ?, ?)
            """,
            (rel_path, file_hash, i, chunk, embedding_blob)
        )

    conn.execute(
        """
        INSERT OR REPLACE INTO files (path, hash, indexed_at)
        VALUES (?, ?, ?)
        """,
        (rel_path, file_hash, datetime.now().isoformat())
    )

    conn.commit()
    return True


def do_index_all() -> dict:
    """Index all memory files. Returns status dict."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(MEMORY_DB)
    init_db(conn)

    indexed = 0
    files_indexed = []

    # Index MEMORY.md
    memory_file = AGENT_DIR / "MEMORY.md"
    if memory_file.exists():
        if index_file(conn, memory_file):
            files_indexed.append("MEMORY.md")
            indexed += 1

    # Index all memory files recursively
    if MEMORY_DIR.exists():
        for md_file in MEMORY_DIR.glob("**/*.md"):
            rel_path = md_file.relative_to(AGENT_DIR)
            if index_file(conn, md_file):
                files_indexed.append(str(rel_path).replace("\\", "/"))
                indexed += 1

    # Index extra scan directories
    for extra_dir in EXTRA_SCAN_DIRS:
        if not extra_dir.exists():
            continue
        # Files under AGENT_DIR keep agent-relative paths; others use parent as root
        root = AGENT_DIR if str(extra_dir).startswith(str(AGENT_DIR)) else extra_dir.parent
        for md_file in extra_dir.glob("**/*.md"):
            if index_file(conn, md_file, relative_root=root):
                files_indexed.append(str(md_file.relative_to(root)).replace("\\", "/"))
                indexed += 1

    conn.close()

    return {
        "indexed": indexed,
        "files": files_indexed,
        "message": f"Indexed {indexed} file(s)"
    }


def do_search(query: str, limit: int = 5) -> List[Tuple[str, str, float]]:
    """Search memory using vector similarity."""
    if not MEMORY_DB.exists():
        return []

    conn = sqlite3.connect(MEMORY_DB)

    query_embedding = embed_texts([query])[0]

    cursor = conn.execute(
        "SELECT file_path, content, embedding FROM chunks WHERE embedding IS NOT NULL"
    )

    results = []
    for row in cursor:
        file_path, content, embedding_blob = row
        chunk_embedding = json.loads(embedding_blob.decode())
        score = cosine_similarity(query_embedding, chunk_embedding)
        results.append((file_path, content, score))

    conn.close()

    results.sort(key=lambda x: x[2], reverse=True)
    return results[:limit]


def do_search_hybrid(query: str, limit: int = 5) -> List[Tuple[str, str, float]]:
    """Hybrid search combining vector similarity and keyword matching."""
    vector_results = do_search(query, limit=limit * 2)

    query_terms = set(query.lower().split())

    boosted_results = []
    for file_path, content, vector_score in vector_results:
        content_lower = content.lower()
        keyword_matches = sum(1 for term in query_terms if term in content_lower)
        keyword_boost = keyword_matches * 0.1
        combined_score = vector_score + keyword_boost
        boosted_results.append((file_path, content, combined_score))

    boosted_results.sort(key=lambda x: x[2], reverse=True)
    return boosted_results[:limit]


def search_to_json(query: str, limit: int = 5) -> List[dict]:
    """Search and return results as JSON-serializable list."""
    results = do_search_hybrid(query, limit=limit)
    return [
        {"file": file_path, "content": content, "score": score}
        for file_path, content, score in results
    ]


# =============================================================================
# HTTP Server Mode (FastAPI)
# =============================================================================

def run_http_server(host: str = "0.0.0.0", port: int = 5000):
    """Run the HTTP server for the vector search service."""
    try:
        from fastapi import FastAPI, Query, HTTPException
        from fastapi.responses import JSONResponse
        import uvicorn
    except ImportError:
        print("FastAPI/uvicorn not installed. Install with: pip install fastapi uvicorn[standard]")
        sys.exit(1)

    app = FastAPI(
        title="Singularity Vector Search",
        description="Vector similarity search for agent memory",
        version="1.0.0"
    )

    @app.get("/health")
    async def health():
        """Health check endpoint."""
        return {"status": "healthy", "service": "vector-search"}

    @app.get("/search")
    async def search(
        q: str = Query(..., description="Search query"),
        limit: int = Query(default=5, ge=1, le=50, description="Maximum results")
    ):
        """Search memory using vector similarity."""
        if not q.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        try:
            results = search_to_json(q, limit=limit)
            return {"results": results, "query": q}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/index")
    async def index():
        """Rebuild the vector search index."""
        try:
            result = do_index_all()
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/stats")
    async def stats():
        """Get index statistics."""
        if not MEMORY_DB.exists():
            return {"chunks": 0, "files": 0}

        conn = sqlite3.connect(MEMORY_DB)
        try:
            chunks = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
            files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
            return {"chunks": chunks, "files": files}
        finally:
            conn.close()

    print(f"Starting vector search HTTP server on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")


# =============================================================================
# MCP Server Mode
# =============================================================================

async def run_mcp_server():
    """Run the MCP server for Claude CLI integration."""
    try:
        from mcp.server import Server
        from mcp.server.stdio import stdio_server
        from mcp.types import Tool, TextContent
    except ImportError:
        print("MCP not installed. Install with: pip install mcp>=1.0.0")
        sys.exit(1)

    server = Server("memory-search")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools."""
        return [
            Tool(
                name="memory_search",
                description="Search the agent's memory files using vector similarity. Returns relevant chunks from MEMORY.md and daily activity logs.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query to find relevant memories"
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum number of results to return (default: 5)",
                            "default": 5
                        }
                    },
                    "required": ["query"]
                }
            ),
            Tool(
                name="memory_index",
                description="Rebuild the vector search index for all memory files. Run this after adding or modifying memory files to ensure search is up to date.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        """Handle tool calls."""
        if name == "memory_search":
            query = arguments.get("query", "")
            limit = arguments.get("limit", 5)

            if not query:
                return [TextContent(type="text", text="Error: query is required")]

            results = do_search_hybrid(query, limit=limit)

            if not results:
                return [TextContent(type="text", text="No results found. The index may be empty - try running memory_index first.")]

            output = [f"Search results for: {query}\n"]
            output.append("=" * 60)

            for i, (file_path, content, score) in enumerate(results, 1):
                output.append(f"\n[{i}] {file_path} (score: {score:.3f})")
                output.append("-" * 40)
                if len(content) > 300:
                    output.append(content[:300] + "...")
                else:
                    output.append(content)

            output.append("\n" + "=" * 60)
            return [TextContent(type="text", text="\n".join(output))]

        elif name == "memory_index":
            result = do_index_all()
            return [TextContent(type="text", text=result["message"])]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


# =============================================================================
# CLI Mode
# =============================================================================

def cli_main():
    """CLI entry point for testing and cron jobs."""
    if len(sys.argv) < 2:
        print("Usage: memory-search.py <command> [args]")
        print("\nCommands:")
        print("  serve       Start MCP server (default)")
        print("  http        Start HTTP server (for control plane)")
        print("  index       Rebuild the vector search index")
        print("  search <q>  Search memory for query (returns JSON)")
        print("\nHTTP options:")
        print("  --host HOST  Bind address (default: 0.0.0.0)")
        print("  --port PORT  Port number (default: 5000)")
        sys.exit(1)

    command = sys.argv[1]

    if command == "serve":
        asyncio.run(run_mcp_server())

    elif command == "http":
        # Parse HTTP server options
        host = "0.0.0.0"
        port = 5000
        args = sys.argv[2:]
        i = 0
        while i < len(args):
            if args[i] == "--host" and i + 1 < len(args):
                host = args[i + 1]
                i += 2
            elif args[i] == "--port" and i + 1 < len(args):
                port = int(args[i + 1])
                i += 2
            else:
                i += 1
        run_http_server(host=host, port=port)

    elif command == "index":
        result = do_index_all()
        print(json.dumps(result, indent=2))

    elif command == "search":
        if len(sys.argv) < 3:
            print("Usage: memory-search.py search <query> [--limit N]")
            sys.exit(1)

        # Parse search options
        query_parts = []
        limit = 5
        args = sys.argv[2:]
        i = 0
        while i < len(args):
            if args[i] == "--limit" and i + 1 < len(args):
                limit = int(args[i + 1])
                i += 2
            else:
                query_parts.append(args[i])
                i += 1

        query = " ".join(query_parts)
        results = search_to_json(query, limit=limit)
        print(json.dumps(results, indent=2))

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    # Default to MCP server if no args
    if len(sys.argv) == 1:
        asyncio.run(run_mcp_server())
    else:
        cli_main()
