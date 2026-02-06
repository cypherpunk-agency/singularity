# Extensions

Extensions add UI pages and optional backend API routes without modifying core files. They're auto-discovered at build time via Vite glob imports and code-split into lazy-loaded chunks.

## Quick Start

Create two files in `packages/ui/src/extensions/my-extension/`:

**manifest.json**
```json
{
  "name": "My Extension",
  "icon": "🔧",
  "path": "my-extension",
  "description": "What it does",
  "order": 100
}
```

**index.tsx**
```tsx
import { useStore } from '../../store';
import * as api from '../../lib/api';

export default function MyExtension() {
  const status = useStore((s) => s.status);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">My Extension</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-slate-300">Agent is {status?.isRunning ? 'running' : 'idle'}</p>
      </div>
    </div>
  );
}
```

Then rebuild:
```bash
docker exec -u agent singularity-agent pnpm --filter @singularity/ui build
```

Refresh the browser — your extension appears in the sidebar.

## Available Imports

Extensions have full access to app internals:

```tsx
// State management
import { useStore } from '../../store';
const status = useStore((s) => s.status);
const messages = useStore((s) => s.messages);

// API client
import * as api from '../../lib/api';
const { files } = await api.getFiles();
const { content } = await api.getFileContent('memory/my-ext/data.json');
await api.updateFileContent('memory/my-ext/data.json', JSON.stringify(data));

// All installed packages are available:
// react, react-router-dom, date-fns, clsx, lucide-react, etc.
```

## Layout Pattern

Follow the standard header + scrollable body pattern used throughout the app:

```tsx
export default function MyExtension() {
  return (
    <div className="flex flex-col h-full">
      {/* Fixed header */}
      <div className="px-6 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">Title</h2>
        <p className="text-sm text-slate-400">Subtitle</p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Content */}
      </div>
    </div>
  );
}
```

Common Tailwind patterns:
- Card: `bg-slate-800 rounded-lg p-4`
- Section header: `text-sm font-medium text-slate-300 mb-2`
- Body text: `text-slate-300` or `text-slate-400`
- Primary button: `px-3 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-500`

## Manifest Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Sidebar label |
| `icon` | string | yes | Emoji icon |
| `path` | string | yes | URL segment (`/ext/{path}`) |
| `description` | string | no | Tooltip or description |
| `order` | number | no | Sidebar sort order (lower = higher, default 100) |

## Backend API Routes

Extensions can optionally register backend API routes.

Create a file in `packages/control-plane/src/extensions/`:

**my-extension.ts**
```typescript
import type { FastifyInstance } from 'fastify';

export async function registerRoutes(fastify: FastifyInstance, prefix: string) {
  fastify.get(`${prefix}/hello`, async () => {
    return { message: 'Hello from my extension' };
  });

  fastify.post(`${prefix}/data`, async (request) => {
    const body = request.body as { value: string };
    return { received: body.value };
  });
}
```

Rebuild and restart:
```bash
docker exec -u agent singularity-agent pnpm --filter @singularity/control-plane build
curl -X POST localhost:3001/api/agent/restart
```

Routes are mounted at `/api/ext/{filename}/`. Call from frontend:
```tsx
const res = await fetch('/api/ext/my-extension/hello');
const data = await res.json();
```

## Deployment Models

### In-repo (developing Singularity itself)

Extensions live in `packages/ui/src/extensions/`. The repo is volume-mounted into the container:

```bash
# After creating/modifying an extension
docker exec -u agent singularity-agent pnpm --filter @singularity/ui build
```

### Separate repo (custom agent pulling Singularity)

**Option A: Custom Docker image**

```dockerfile
FROM singularity:latest
COPY extensions/ /app/packages/ui/src/extensions/
RUN cd /app && pnpm --filter @singularity/ui build
```

The Singularity image already contains source + node_modules, so the rebuild is just a Vite incremental build (~5s).

**Option B: Volume mount (development)**

```yaml
volumes:
  - ./extensions:/app/packages/ui/src/extensions
```

Then build inside the container after mounting.

## File Persistence

Extensions can persist data via the existing file API. Use the `memory/` directory:

```tsx
// Read
const { content } = await api.getFileContent('memory/my-ext/data.json');
const data = JSON.parse(content);

// Write
await api.updateFileContent('memory/my-ext/data.json', JSON.stringify(newData, null, 2));
```

## Error Handling

Extensions are wrapped in an error boundary. If your extension throws a runtime error:
- The error is caught and a fallback UI is shown with the error message and stack trace
- Other pages and extensions continue to work normally
- A "Reload Extension" button lets the user retry

## Troubleshooting

**Extension not appearing in sidebar:**
- Check that `manifest.json` is valid JSON with `name`, `icon`, and `path` fields
- Check that `index.tsx` has a `default` export
- Rebuild: `docker exec -u agent singularity-agent pnpm --filter @singularity/ui build`
- Check the build output for errors

**Build errors:**
- Extension files follow standard TypeScript/React conventions
- Import paths from extensions use `../../store`, `../../lib/api` etc. (relative to extension dir)

**Backend extension not loading:**
- Ensure the file exports `registerRoutes(fastify, prefix)`
- Rebuild control-plane: `pnpm --filter @singularity/control-plane build`
- Restart: `curl -X POST localhost:3001/api/agent/restart`
- Check logs: `docker logs singularity-agent`

**Extension shows error boundary:**
- Check browser console for the full error
- The error boundary shows the message and stack trace
- Click "Reload Extension" to retry after fixing
