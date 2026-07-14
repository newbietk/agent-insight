# KirinAI-Insight

Session-level observability tool for LLM coding agents. Helps analyze long-context usage patterns, detect model hallucination issues, and govern context window growth across agent sessions.

**[中文文档](README-zh.md)**

## Features

Import opencode sessions.db or Claude Code JSONL logs, then analyze Agent sessions turn-by-turn:

- **Tokens & Cost** — 5-item token breakdown per turn with bar chart relative to model context window; cost estimation from token usage and model pricing
- **Context Growth** — Context growth chart per subagent session; animated replay of context window evolution with subagent spawn/death markers; `/compact` markers with context-drop annotations across multiple compactions
- **Context Governance** — View LLM input context composition: visible messages + stable "System (hidden)" overhead; input window correctly truncated at each `/compact` boundary
- **Subagent Tracking** — Identify subagent sessions, build dispatch→response bridges; SVG diagram showing main↔subagent connections
- **Skill Events** — Track skill load/invoke/use events per turn
- **Workflow** — Divide a session into phases by the workflow skill's own progress markers (阶段一/二/三/四 in non-thinking assistant output; future-tense mentions like "后续可继续执行阶段二" are ignored); skills attach to whichever phase their dispatch root turn falls in, so a session that only completed 阶段一 shows as a single 阶段一 — not every session runs the full workflow. Falls back to skill-family gap heuristics when no markers exist
- **Concept Tracing** — Search keywords across turns, view propagation chain and DAG graph
- **File Read Analysis** — Detect duplicate and unnecessary file reads
- **Session Compare** — Compare two sessions on tokens, cost, latency, tool calls, and subagents

## Quick Start

A 3-step path to your first session analysis.

### 1. Prerequisites

- **Node.js >= 22.5** (required for built-in `node:sqlite`). Check with `node -v`.
- **npm** (comes with Node.js).

On Linux/macOS, `start.sh` auto-detects your Node version and can switch via nvm. On Windows, install Node 22+ directly from [nodejs.org](https://nodejs.org).

### 2. Clone, Install & Start

```bash
git clone https://github.com/newbietk/KirinAI-Insight.git
cd kirinai-insight

# Linux / macOS / WSL — one command:
./start.sh

# Windows (cmd / PowerShell) — manual steps:
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Open **http://localhost:21025** in your browser.

### 3. Import Your First Session

On the home page, click the **"Import"** button (top-right). You'll see two source types:

| Source | Typical Path |
|--------|-------------|
| **Opencode** | `~/.local/share/opencode/opencode.db` (Linux) / `%LOCALAPPDATA%\opencode\opencode.db` (Windows) |
| **Claude Code** | `~/.claude/projects/` — select a project directory to scan all `.jsonl` files |

Select a source type, pick a session from the list, and click **Import**. After import completes, click the session row to enter the full 9-tab analysis view.

> **Tip**: You can also drag & drop a `.db` or `.jsonl` file onto the import dialog.

### Optional: Upload to KirinAI Cloud

If you want to submit a session with structured feedback to the cloud platform:

1. Clone and start [KirinAI-Cloud](https://github.com/newbietk/KirinAI-Cloud) on port 21026
2. Copy `.env.example` to `.env` (defaults point to `http://localhost:21026`)
3. Click the **Upload** button (cloud icon) on any session to open the feedback form

## Option 1: VSCode Extension

Analyze sessions without leaving your editor. The VSCode extension brings 6 tabs of analysis into a sidebar panel.

**Requires VSCode >= 1.92.0**

### Install

Download the latest `.vsix` from [Releases](https://github.com/newbietk/agent-insight/releases), then:

- `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → select the file
- Or install from [VSCode Marketplace](https://marketplace.visualstudio.com/) (coming soon)

### Quick Start

1. Click the **graph icon** (📊) in the activity bar
2. Click **cloud-download** → **Auto-detect** `~/.claude/projects` (or pick a `.jsonl` file)
3. Click any session to open the 6-tab analysis panel

**6 Analysis Tabs:** Overview (token trends) · Turns (context composition) · Skills · File Reads · Subagents · Breakdown

See [vscode-extension/README.md](vscode-extension/README.md) ([中文](vscode-extension/README-zh.md)) for detailed usage, configuration, packaging, and development guide.

## Option 2: Web UI

**Requires Node.js >= 22.5** (for built-in `node:sqlite` module). If you have nvm, `start.sh` auto-switches to Node 22 LTS.

Log file locations:
- opencode: `~/.local/share/opencode/sessions.db`
- Claude Code: `~/.claude/projects/<hash>/sessions/<id>.jsonl`, or point to a directory to scan all .jsonl files

```bash
./start.sh          # Auto install + migrate + start Web UI on port 21025
./start.sh -u       # Update dependencies + migrate + start Web UI
./start.sh -f       # Fresh build (clear .next cache, rebuild from scratch)
```

Open `http://localhost:21025`. After importing a log file, click a session to explore 9 analysis tabs.

Web UI also supports: exporting sessions to standalone SQLite or hierarchical Markdown; uploading sessions to KirinAI Cloud with structured feedback.

## Option 3: CLI Upload + Web Analysis

Designed for SSH remote servers, Web IDEs, and other environments without a browser. CLI imports and uploads in one step, then analyze in Web UI.

Log file locations:
- opencode: `~/.local/share/opencode/sessions.db`
- Claude Code: `~/.claude/projects/<hash>/sessions/<id>.jsonl`, or point to a directory to scan all .jsonl files

```bash
# Upload from source file (source type auto-detected from file extension)
npx tsx src/cli/index.ts upload --file ./sessions.db           # Interactive picker if multiple sessions
npx tsx src/cli/index.ts upload --file ./logs/                 # Claude JSONL (directory)
```

Upload triggers an interactive description prompt. Backend auto-starts if not running and stops after upload completes.

After upload, view analysis in Web UI: the uploaded session is imported into the local Insight DB and ready for analysis immediately.
