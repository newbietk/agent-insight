# Scan Auto-Discover — Design Spec

## Goal

Add a "Scan for Sessions" button on the homepage that auto-detects agent sessions from default paths, letting users browse and import discovered sessions with pagination. Keep the existing manual "Import Session" flow untouched.

## Interaction Flow

```
Homepage Header
├── [Scan for Sessions]   ← NEW (left of Import)
└── [Import Session]      ← existing, unchanged

Click Scan → Dialog opens
  ├── Auto-Detect section
  │   ├── Scans default paths per OS per agent
  │   ├── Shows agent cards with status (found N / not installed / path missing)
  │   └── Click agent → session selection view
  │
  └── Custom Path section (bottom, below divider)
      ├── Text input + Browse + "Scan Path" button
      └── Falls back to same session selection view
```

## Default Paths per Agent

```typescript
const AGENT_DEFAULT_PATHS: Record<string, Record<string, string[]>> = {
  'opencode': {
    linux:   ['~/.local/share/opencode/opencode.db'],
    darwin:  ['~/Library/Application Support/opencode/opencode.db'],
    win32:   ['%LOCALAPPDATA%/opencode/opencode.db', '%USERPROFILE%/.local/share/opencode/opencode.db'],
  },
  'claude-code': {
    linux:   ['~/.claude/projects/'],
    darwin:  ['~/Library/Application Support/Claude Code/projects/'],
    win32:   ['%APPDATA%/Claude Code/projects/', '%USERPROFILE%/.claude/projects/'],
  },
};
```

## Components

### 1. New: `ScanDialog` (client component)

A multi-step dialog with these states:

| Step | Description |
|------|-------------|
| `scanning` | Shows scanning spinner per agent path |
| `results` | Agent cards (found/not-found) + Custom Path input |
| `select` | Session picker table with pagination |
| `importing` | Reuses existing import progress UI from `LocalFileImport` |

### 2. New: `src/lib/discovery.ts` (server-side utility)

- `discoverAgentSessions(agentId, customPath?)` — scans known paths, returns `{sessions: SessionPreview[], sourcePath: string}`
- Uses existing adapter's `listSessions()` for each found path
- Runs via API route so the browser doesn't do filesystem work

### 3. New API: `POST /api/ingest/discover`

Request:
```json
{ "action": "scan" }
// or
{ "action": "scan", "agentId": "claude-code", "customPath": "/custom/path" }
// or
{ "action": "load-sessions", "agentId": "claude-code", "sourcePath": "/found/path" }
```

Response (scan):
```json
{
  "agents": [
    { "id": "claude-code", "name": "Claude Code", "found": true, "sessionCount": 12, "sourcePath": "/path", "latestAt": "..." },
    { "id": "opencode", "name": "Opencode", "found": true, "sessionCount": 47, "sourcePath": "/path", "latestAt": "..." },
    { "id": "cursor", "name": "Cursor", "found": false, "reason": "not-installed" }
  ]
}
```

Response (load-sessions):
```json
{
  "sessions": [{ "id": "...", "createdAt": "...", "firstQuery": "...", "turnCount": 12, "model": "..." }],
  "total": 12
}
```

### 4. Modification: `page.tsx` header

Add `<ScanDialog />` component to the left of `<LocalFileImport />`:

```tsx
<div className="flex items-center gap-3">
  <ScanDialog />
  <LocalFileImport />
  {/* existing monitor link */}
</div>
```

## Session Selection (reuse existing patterns)

- Same table layout as existing `step === "select"` in `LocalFileImport`
- Pagination: pageSize=20, Previous/Next buttons
- "Select all on this page" checkbox
- "Import N Selected" button
- Concurrent import pool (reuse CONCURRENCY=4 pattern)
- After import: save to ImportHistory, toast, refresh page

## What stays unchanged

- `LocalFileImport` component — no modifications
- `ImportHistory` component — no modifications
- `SessionList` component — no modifications
- All existing API routes — no modifications
- All ingest pipeline code — no modifications

## New files

```
src/
├── app/api/ingest/discover/route.ts    # NEW: discovery API
├── lib/discovery.ts                     # NEW: auto-detect logic
├── components/ScanDialog.tsx            # NEW: scan dialog UI
└── app/page.tsx                         # MODIFIED: add ScanDialog to header
```

## Test plan

- `tests/discovery.test.ts` — unit tests for `discoverAgentSessions()` with mocked paths
- `tests/discover-api.test.ts` — integration test for `POST /api/ingest/discover`
- Existing tests must continue to pass (no changes to existing code paths)
