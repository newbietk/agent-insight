# CANNBot Insight - VSCode Extension

Session-level observability tool for LLM coding agents, integrated into VSCode. Import sessions from Claude Code, CodeAgent 3.0, and OpenCode — then analyze token usage, context growth, skill events, file operations, and subagents without leaving your editor.

**[中文文档](README-zh.md)**

## Features

**7-Tab Analysis Panel** — click any session in the sidebar to open a detailed webview:

| Tab | Description |
|-----|-------------|
| **Overview** | Summary cards (tokens, cost, latency, model) + token trend line chart with hover tooltips |
| **Turns** | Turn cards with role badges, tool counts, skill markers; context composition stacked bar (system/user/assistant/tool/cache); expandable message content; **subagent lanes** under dispatching root turns |
| **Trace** | Search turns by keyword/tool/skill; propagation chain trace across turns |
| **Context** | Multi-agent context window usage trend chart per agent over turn sequence |
| **Audit** | Workflow block diagram + issue analysis via pasted JSON from Claude Code audit prompts |
| **Skills** | Skill invocation timeline with event types (load/invoke/use), success rate, and per-turn mapping |
| **File Ops** | Per-file read analysis with overlap/redundancy detection; file operations timeline with expandable code blocks and side-by-side diffs; batched file list expansion (10 per click) |

**Import Sources** — auto-detect + manual import for 3 agents:

| Agent | Auto-detect Path | Manual Options |
|-------|-----------------|----------------|
| **Claude Code** | `~/.claude/projects/` | Single `.jsonl` file or directory scan |
| **CodeAgent 3.0** | `~/.cac/projects/` | Single `.jsonl` file or directory scan |
| **OpenCode** | `%APPDATA%/opencode/` (Windows), `~/.local/share/opencode/` (Linux) | Browse SQLite DB → select sessions |

**Subagent Tracking** — bridges infrastructure links dispatching `Agent`/`Task` tool calls to subagent sessions. Subagent lanes appear inline under root turns showing turn count, token usage, and dispatch prompts.

**Auto-Sync** — configurable background sync keeps sessions up-to-date as you use Claude Code.

## Requirements

- **VSCode >= 1.92.0**
- **Node.js >= 22** (used internally by the extension for SQLite via `sql.js`)

## Usage

### Install from VSIX

1. Download the latest `.vsix` file from [Releases](https://github.com/newbietk/agent-insight/releases)
2. In VSCode: `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → select the file
3. Click the **graph icon** (📊) in the activity bar to open the CANNBot Insight panel

### Import Sessions

1. In the CANNBot Insight sidebar, click the **cloud-download** icon (📥)
2. Choose import mode: **Auto-detect** or **Manual import**
3. Select the agent source (Claude Code / CodeAgent 3.0 / OpenCode)
4. After import, click any session in the sidebar to open the 7-tab analysis view

### Sidebar Actions

| Icon | Action |
|------|--------|
| 📥 | Import new sessions |
| 🔄 | Refresh session list |
| 🔄✨ | Sync all sessions from source |

Each session row supports:
- 👁 **Open** — open analysis panel
- 🔄 **Sync** — re-import latest data for this session
- 🗑 **Delete** — remove session from local storage

### Configuration

Open VSCode Settings (`Ctrl+,`) → search "CANNBot Insight":

| Setting | Default | Description |
|---------|---------|-------------|
| `hismartlite.claudeProjectsPath` | `""` | Custom path to Claude Code projects directory (empty = auto-detect `~/.claude/projects/`) |
| `hismartlite.cloudUrl` | `""` | CANNBot Cloud server URL |
| `hismartlite.autoSync.enabled` | `false` | Enable automatic background sync of sessions |
| `hismartlite.autoSync.intervalMs` | `30000` | Sync interval in milliseconds |

## Packaging

### Build VSIX

```bash
cd vscode-extension
npm install
npm run compile
npm run copy-assets
npx @vscode/vsce package
```

This produces `cannbot-insight-<version>.vsix` in the current directory.

### Verify the package

```bash
npx @vscode/vsce ls
npx @vscode/vsce package --dry-run
```

## Development

```bash
cd vscode-extension
npm install
npm run compile

# Watch mode
npm run watch

# Debug: open vscode-extension/ in VSCode, press F5
```

### Project Structure

```
vscode-extension/
├── src/
│   ├── core/                  # Data pipeline
│   │   ├── claude-jsonl.ts    # Claude Code JSONL adapter
│   │   ├── opencode-db.ts     # OpenCode SQLite adapter
│   │   ├── normalize.ts       # Data normalization
│   │   ├── turn-split.ts      # Turn/ToolCall/SkillEvent extraction
│   │   ├── cost-calculator.ts # Model pricing & cost estimation
│   │   └── context-window-config.ts  # Model context window limits
│   ├── storage/
│   │   └── db.ts              # SQLite storage (sql.js)
│   ├── views/
│   │   ├── sessionTree.ts     # Sidebar TreeDataProvider
│   │   └── sessionPanel.ts    # Webview panel manager
│   ├── media/
│   │   ├── webviewContent.ts  # HTML/CSS/JS template generator
│   │   ├── shared.ts          # Shared utilities
│   │   ├── nav.ts             # Tab navigation runtime
│   │   ├── theme.ts           # VS Code theme variable sync
│   │   └── tabs/              # Per-tab render functions
│   │       ├── overview.ts    # Token trend chart
│   │       ├── turns.ts       # Turn cards + context composition + subagent lanes
│   │       ├── trace.ts       # Search + propagation chain
│   │       ├── context.ts     # Multi-agent context growth chart
│   │       ├── audit.ts       # Workflow audit block diagram
│   │       ├── skills.ts      # Skill events timeline
│   │       └── fileops.ts     # File operations audit + per-file analysis
│   ├── sync/
│   │   └── scheduler.ts       # Auto-sync interval scheduler
│   ├── i18n/                  # Internationalization (en, zh-cn)
│   ├── extension.ts          # Extension entry point
│   └── importer.ts           # Import orchestration + bridge extraction
├── package.json               # Extension manifest
├── tsconfig.json
└── README.md
```

## License

MIT
