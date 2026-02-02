# UI Package Guidelines

Read `docs/UI-SAFETY.md` for full safety guidelines.

## Quick Reference

**Before any UI deployment:**
```bash
./scripts/validate-ui-changes.sh
```

**Run tests:**
```bash
pnpm --filter @singularity/ui test
```

## Protected Files (require permission)
- App.tsx, main.tsx, router.tsx - routing/entry
- store.ts - state management
- Layout.tsx, Status.tsx, Chat.tsx, AppProvider.tsx - core components
- hooks/useWebSocket.ts, lib/api.ts - backend communication
- vite.config.ts, package.json - build config

## Modifiable Files (autonomous)
- components/Files.tsx, Outputs.tsx, History.tsx, Jobs.tsx, FileViewer.tsx
