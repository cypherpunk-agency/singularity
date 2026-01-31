#!/usr/bin/env python3
"""
Singularity Memory Search
Vector search implementation using SQLite + sentence-transformers
"""

import os
import sys
import json
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Optional

# Configuration
APP_DIR = Path("/app")
AGENT_DIR = APP_DIR / "agent"
STATE_DIR = APP_DIR / "state"
MEMORY_DB = STATE_DIR / "memory.db"
MEMORY_DIR = AGENT_DIR / "memory"

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
        # Try common locations for sqlite-vec
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
    """
    Split text into overlapping chunks.
    Uses simple word-based splitting as approximation for tokens.
    """
    words = text.split()
    chunks = []

    # Approximate tokens as words * 1.3
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


def index_file(conn: sqlite3.Connection, file_path: Path):
    """Index a single file into the database."""
    file_hash = get_file_hash(file_path)
    rel_path = str(file_path.relative_to(AGENT_DIR))

    # Check if file needs reindexing
    cursor = conn.execute(
        "SELECT hash FROM files WHERE path = ?",
        (rel_path,)
    )
    row = cursor.fetchone()

    if row and row[0] == file_hash:
        return False  # Already indexed

    # Read and chunk file
    content = file_path.read_text(encoding="utf-8", errors="ignore")
    chunks = chunk_text(content)

    if not chunks:
        return False

    # Generate embeddings
    embeddings = embed_texts(chunks)

    # Clear old chunks for this file
    conn.execute("DELETE FROM chunks WHERE file_path = ?", (rel_path,))

    # Insert new chunks
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        embedding_blob = json.dumps(embedding).encode()
        conn.execute(
            """
            INSERT INTO chunks (file_path, file_hash, chunk_index, content, embedding)
            VALUES (?, ?, ?, ?, ?)
            """,
            (rel_path, file_hash, i, chunk, embedding_blob)
        )

    # Update file tracking
    conn.execute(
        """
        INSERT OR REPLACE INTO files (path, hash, indexed_at)
        VALUES (?, ?, ?)
        """,
        (rel_path, file_hash, datetime.now().isoformat())
    )

    conn.commit()
    return True


def index_all():
    """Index all memory files."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(MEMORY_DB)
    init_db(conn)

    indexed = 0

    # Index MEMORY.md
    memory_file = AGENT_DIR / "MEMORY.md"
    if memory_file.exists():
        if index_file(conn, memory_file):
            print(f"Indexed: MEMORY.md")
            indexed += 1

    # Index daily logs
    if MEMORY_DIR.exists():
        for log_file in MEMORY_DIR.glob("*.md"):
            if index_file(conn, log_file):
                print(f"Indexed: memory/{log_file.name}")
                indexed += 1

        # Index archived logs
        archive_dir = MEMORY_DIR / "archive"
        if archive_dir.exists():
            for log_file in archive_dir.glob("*.md"):
                if index_file(conn, log_file):
                    print(f"Indexed: memory/archive/{log_file.name}")
                    indexed += 1

    conn.close()
    print(f"\nTotal files indexed: {indexed}")


def search(query: str, limit: int = 5) -> List[Tuple[str, str, float]]:
    """
    Search memory using vector similarity.
    Returns list of (file_path, content, score) tuples.
    """
    if not MEMORY_DB.exists():
        print("No index found. Run 'index' first.")
        return []

    conn = sqlite3.connect(MEMORY_DB)

    # Generate query embedding
    query_embedding = embed_texts([query])[0]

    # Get all chunks with embeddings
    cursor = conn.execute(
        "SELECT file_path, content, embedding FROM chunks WHERE embedding IS NOT NULL"
    )

    results = []
    for row in cursor:
        file_path, content, embedding_blob = row
        chunk_embedding = json.loads(embedding_blob.decode())

        # Calculate similarity
        score = cosine_similarity(query_embedding, chunk_embedding)
        results.append((file_path, content, score))

    conn.close()

    # Sort by score and return top results
    results.sort(key=lambda x: x[2], reverse=True)
    return results[:limit]


def search_hybrid(query: str, limit: int = 5) -> List[Tuple[str, str, float]]:
    """
    Hybrid search combining vector similarity and keyword matching.
    """
    # Vector search results
    vector_results = search(query, limit=limit * 2)

    # Simple keyword matching for BM25-like boost
    query_terms = set(query.lower().split())

    boosted_results = []
    for file_path, content, vector_score in vector_results:
        content_lower = content.lower()

        # Count keyword matches
        keyword_matches = sum(1 for term in query_terms if term in content_lower)
        keyword_boost = keyword_matches * 0.1  # 10% boost per matching term

        combined_score = vector_score + keyword_boost
        boosted_results.append((file_path, content, combined_score))

    # Re-sort and return
    boosted_results.sort(key=lambda x: x[2], reverse=True)
    return boosted_results[:limit]


def cmd_search(query: str):
    """Search command handler."""
    results = search_hybrid(query)

    if not results:
        print("No results found.")
        return

    print(f"Search results for: {query}\n")
    print("=" * 60)

    for i, (file_path, content, score) in enumerate(results, 1):
        print(f"\n[{i}] {file_path} (score: {score:.3f})")
        print("-" * 40)
        # Truncate long content
        if len(content) > 300:
            print(content[:300] + "...")
        else:
            print(content)

    print("\n" + "=" * 60)


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: memory-search.py <command> [args]")
        print("\nCommands:")
        print("  index         Rebuild the vector search index")
        print("  search <q>    Search memory for query")
        sys.exit(1)

    command = sys.argv[1]

    if command == "index":
        index_all()
    elif command == "search":
        if len(sys.argv) < 3:
            print("Usage: memory-search.py search <query>")
            sys.exit(1)
        query = " ".join(sys.argv[2:])
        cmd_search(query)
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
