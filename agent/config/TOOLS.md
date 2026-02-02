# Agent Tools

These are tools available to you. Use them when appropriate.

## Vector Memory Search

Search your memory files semantically to find relevant information.

**Usage:**
```bash
curl -s "http://vector:5000/search?q=YOUR_QUERY&limit=5"
```

**Parameters:**
- `q` - Search query (URL encoded)
- `limit` - Max results (default: 5)

**Example:**
```bash
# Find information about Docker optimization
curl -s "http://vector:5000/search?q=docker+optimization&limit=3"
```

**Returns:** JSON with matching chunks from MEMORY.md and memory/*.md files

## Request Service Restart

Request a rebuild and restart of the control-plane and UI (e.g., to apply code changes you made).

**Usage:**
```bash
curl -s -X POST http://localhost:3001/api/agent/restart
```
