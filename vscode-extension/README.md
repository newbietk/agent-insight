# KirinAI Insight - VSCode Extension

Session-level observability tool for LLM coding agents, integrated into VSCode.

## Features (MVP)

- **Import Claude Code JSONL sessions** — from `~/.claude/projects/` or any directory
- **Token & Cost Overview** — total tokens, input/output/cache breakdown, estimated cost
- **Context Growth Visualization** — color-coded bar chart showing context window usage per turn
- **Turn List** — per-turn token breakdown with tool call and skill event details
- **Token Composition Chart** — stacked bar chart of input/output/cache per turn

## Quick Start

1. Press F5 to launch the extension in debug mode (or install from VSIX)
2. Click the **graph icon** in the activity bar (left sidebar)
3. Click the **cloud-download** icon → choose import method:
   - **Auto-detect** `~/.claude/projects` (recommended)
   - **Import a .jsonl file** directly
   - **Scan a directory** for .jsonl files
4. Click a session in the sidebar to open the analysis panel
5. Explore tabs: Overview, Context Growth, Turns, Token Breakdown

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Debug (press F5 in VSCode)
# Requires: open this folder in VSCode, press F5
```

## Architecture

```
src/
├── core/          # Data pipeline (copied from KirinAI-Insight web app)
│   ├── claude-jsonl.ts    # Claude Code JSONL adapter
│   ├── normalize.ts       # Data normalization
│   ├── turn-split.ts      # Turn/ToolCall/SkillEvent extraction
│   ├── cost-calculator.ts # Model pricing & cost estimation
│   ├── context-window-config.ts  # Model context limits
│   └── command-parser.ts  # Claude Code command detection
├── storage/
│   └── db.ts       # SQLite storage (node:sqlite, no Prisma)
├── views/
│   ├── sessionTree.ts   # Sidebar TreeDataProvider
│   └── sessionPanel.ts  # Webview panel manager
├── media/
│   └── webviewContent.ts  # HTML/CSS/JS for session detail view
├── importer.ts     # Import orchestration
└── extension.ts    # Extension entry point
```
