# Safe UI Development Guidelines

This document defines how the Singularity agent can autonomously improve UI feature pages without breaking core functionality.

## Purpose

Enable the agent to:
- Improve feature pages (Files, Outputs, History, Jobs) autonomously
- Maintain stability of core infrastructure (Chat, Layout, routing, state management)
- Validate changes before deployment

## Protected vs Modifiable Files

### Protected Files (Require Permission)

These files are critical infrastructure. Do not modify without explicit user permission:

| File | Rationale |
|------|-----------|
| `packages/ui/src/App.tsx` | Root component, routing setup |
| `packages/ui/src/main.tsx` | Entry point, providers |
| `packages/ui/src/store.ts` | Global state management |
| `packages/ui/src/router.tsx` | Route definitions |
| `packages/ui/src/components/Layout.tsx` | Shell, navigation |
| `packages/ui/src/components/Status.tsx` | Agent status display |
| `packages/ui/src/components/Chat.tsx` | Primary user interaction |
| `packages/ui/src/components/AppProvider.tsx` | Context providers |
| `packages/ui/src/hooks/useWebSocket.ts` | Real-time communication |
| `packages/ui/src/lib/api.ts` | Backend communication |
| `packages/ui/vite.config.ts` | Build configuration |
| `packages/ui/package.json` | Dependencies |

### Modifiable Files (Autonomous)

The agent can improve these files without permission:

| File | Description |
|------|-------------|
| `packages/ui/src/components/Files.tsx` | File browser view |
| `packages/ui/src/components/Outputs.tsx` | Agent outputs view |
| `packages/ui/src/components/History.tsx` | Run history view |
| `packages/ui/src/components/Jobs.tsx` | Job tracker view |
| `packages/ui/src/components/FileViewer.tsx` | File content viewer |

### New Files

- **New components**: Ask permission first (affects architecture)
- **New test files**: Can create autonomously
- **New utility functions**: Ask permission if they'll be widely used

## Validation Workflow

Before deploying any UI changes, run the validation script:

```bash
./scripts/validate-ui-changes.sh
```

This script:
1. Runs TypeScript type checking
2. Runs production build
3. Runs all tests
4. Checks if protected files were modified (warns if so)

### Manual Validation Steps

If the script passes, also verify:
1. UI loads at http://localhost:3001
2. Chat functionality works
3. Navigation between views works
4. No console errors

## Decision Matrix

| Scenario | Action |
|----------|--------|
| Bug fix in modifiable file | Fix autonomously, run validation |
| Feature improvement in modifiable file | Implement autonomously, run validation |
| Bug fix in protected file | Ask permission, explain the bug and proposed fix |
| Feature in protected file | Ask permission, explain the change |
| New component needed | Ask permission, explain where it fits |
| Styling changes in modifiable file | Implement autonomously |
| Adding new dependency | Ask permission |

## Testing Requirements

Tests exist for protected components in `packages/ui/src/components/__tests__/`:
- `Layout.test.tsx` - Navigation and structure
- `Chat.test.tsx` - Message input and display
- `store.test.ts` - State management

All tests must pass before deploying changes:

```bash
pnpm --filter @singularity/ui test
```

## Rollback Procedures

If something breaks after a change:

1. **Immediate**: Revert the specific change using git
   ```bash
   git checkout HEAD~1 -- path/to/file.tsx
   ```

2. **If build broke**: Check build output for errors
   ```bash
   docker exec -u agent singularity-agent pnpm --filter @singularity/ui build
   ```

3. **If runtime broke**: Check browser console for errors

4. **Nuclear option**: Rebuild container
   ```bash
   docker-compose -f docker/docker-compose.yml build
   docker-compose -f docker/docker-compose.yml up -d
   ```

## Development Commands

```bash
# Run validation
./scripts/validate-ui-changes.sh

# Run tests only
pnpm --filter @singularity/ui test

# Run typecheck only
pnpm --filter @singularity/ui typecheck

# Run build only
pnpm --filter @singularity/ui build

# Run dev server
pnpm --filter @singularity/ui dev
```

## Examples

### Good: Improving the Files view

```
I'll improve the Files.tsx component to show file sizes.
Running validation... passed.
Deploying changes.
```

### Good: Bug fix in Chat (protected)

```
Found a bug in Chat.tsx where messages don't scroll properly.
Asking permission before fixing this protected file.

**Bug**: Messages don't auto-scroll on mobile
**Fix**: Add `scroll-behavior: smooth` to container
**Risk**: Low - styling only change
```

### Bad: Modifying store without permission

```
I'll add a new state field to store.ts...
```
This should trigger the protected file check and require permission.
