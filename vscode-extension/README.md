# CANNBot Insight - VSCode Extension

Session-level observability tool for LLM coding agents, integrated into VSCode. Import Claude Code JSONL sessions and analyze token usage, context growth, skill events, subagents, and more — without leaving your editor.

**[中文文档](README-zh.md)**

## Features

**6-Tab Analysis Panel** — click any session in the sidebar to open a detailed webview:

| Tab | Description |
|-----|-------------|
| **Overview** | Token trend chart with hover tooltips showing turn details; model/cost summary |
| **Turns** | Turn cards with context composition breakdown — system prompt (hidden), user, assistant, tool messages visualized as stacked bar; click any segment to expand full message content |
| **Skills** | Skill load/invoke/use events per turn with timing |
| **File Reads** | Detect duplicate and unnecessary file read patterns |
| **Subagents** | Subagent session tracking with parent↔child relationship diagram |
| **Breakdown** | Token composition stacked chart (input/output/cache) per turn |

**Import Sources:**
- **Auto-detect** Claude Code project directories (`~/.claude/projects/`)
- **Choose a .jsonl file** directly
- **Scan a directory** for all `.jsonl` files

**Auto-Sync** — configurable background sync to keep sessions up-to-date as you use Claude Code.

## Requirements

- **VSCode >= 1.92.0**
- **Node.js >= 22** (used internally by the extension for SQLite via `node:sqlite`)

## Usage

### Install from VSIX

1. Download the latest `.vsix` file from [Releases](https://github.com/newbietk/agent-insight/releases)
2. In VSCode: `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → select the file
3. Click the **graph icon** (📊) in the activity bar to open the CANNBot Insight panel

### Import Sessions

1. In the CANNBot Insight sidebar, click the **cloud-download** icon (📥)
2. Choose an import method:
   - **Auto-detect** `~/.claude/projects` (recommended) — scans your Claude Code project directories
   - **Import a .jsonl file** — pick a single session file
   - **Scan a directory** — bulk import all `.jsonl` files in a folder
3. After import, click any session in the sidebar to open the 6-tab analysis view

### Sidebar Actions

| Icon | Action |
|------|--------|
| 📥 | Import new sessions |
| 🔄 | Refresh session list |
| 🔄✨ | Sync all sessions from Claude Code projects |

Each session row supports:
- 👁 **Open** — open analysis panel
- 🔄 **Sync** — re-import latest data for this session
- 🗑 **Delete** — remove session from local storage

### Configuration

Open VSCode Settings (`Ctrl+,`) → search "CANNBot Insight":

| Setting | Default | Description |
|---------|---------|-------------|
| `kirinai.claudeProjectsPath` | `""` | Custom path to Claude Code projects directory (empty = auto-detect `~/.claude/projects/`) |
| `kirinai.cloudUrl` | `http://localhost:21026` | CANNBot Cloud server URL for upload/sync |
| `kirinai.autoSync.enabled` | `false` | Enable automatic background sync of sessions |
| `kirinai.autoSync.intervalMs` | `30000` | Sync interval in milliseconds (min 10000) |

## Packaging

### Build VSIX (Development)

```bash
cd vscode-extension
npm install
npm run compile
npm run copy-assets

# Install vsce globally (one-time)
npm install -g @vscode/vsce

# Package as .vsix
vsce package
```

This produces `kirinai-insight-<version>.vsix` in the current directory.

### Build VSIX without global install

```bash
cd vscode-extension
npm install
npm run compile
npm run copy-assets
npx @vscode/vsce package
```

### Verify the package

```bash
# List files included in the VSIX
npx @vscode/vsce ls

# Check for missing files or issues
npx @vscode/vsce package --dry-run
```

### Publish to Marketplace

```bash
# Login (one-time, requires Personal Access Token from Azure DevOps)
npx @vscode/vsce login kirinai

# Publish
npx @vscode/vsce publish

# Or publish with pre-release flag
npx @vscode/vsce publish --pre-release
```

## Development

```bash
cd vscode-extension
npm install
npm run compile

# Watch mode (auto-recompile on changes)
npm run watch

# Debug
# 1. Open the vscode-extension/ folder in VSCode
# 2. Press F5 → launches Extension Development Host
# 3. The CANNBot Insight sidebar icon appears in the activity bar
```

### Project Structure

```
vscode-extension/
├── src/
│   ├── core/                  # Data pipeline (shared with web app)
│   │   ├── claude-jsonl.ts    # Claude Code JSONL adapter
│   │   ├── normalize.ts       # Data normalization
│   │   ├── turn-split.ts      # Turn/ToolCall/SkillEvent extraction
│   │   ├── cost-calculator.ts # Model pricing & cost estimation
│   │   └── context-window-config.ts  # Model context limits
│   ├── storage/
│   │   └── db.ts              # SQLite storage (node:sqlite)
│   ├── views/
│   │   ├── sessionTree.ts     # Sidebar TreeDataProvider
│   │   └── sessionPanel.ts    # Webview panel manager
│   ├── media/
│   │   ├── webviewContent.ts  # HTML/CSS/JS template generator
│   │   ├── shared.ts          # Shared utilities (escape, JSON safe-stringify)
│   │   ├── nav.ts             # Tab navigation runtime
│   │   ├── theme.ts           # VS Code theme variable sync
│   │   └── tabs/              # Per-tab render functions + JS
│   │       ├── overview.ts    # Token trend chart + hover tooltips
│   │       ├── turns.ts       # Turn cards + context composition
│   │       ├── breakdown.ts   # Token composition stacked chart
│   │       ├── skills.ts      # Skill events timeline
│   │       ├── filereads.ts   # File read analysis
│   │       └── subagents.ts   # Subagent relationship diagram
│   ├── sync/
│   │   └── scheduler.ts       # Auto-sync interval scheduler
│   ├── i18n/                  # Internationalization (en, zh-cn)
│   ├── extension.ts          # Extension entry point
│   └── importer.ts           # Import orchestration
├── package.json               # Extension manifest + VSCode contributions
├── tsconfig.json
└── README.md
```

### Files included in VSIX

Controlled by `.vscodeignore` (or `files` in `package.json`). Current packaging includes:
- `out/` — compiled JavaScript
- `src/media/*.png`, `src/media/*.svg` — icons/images for webview

## Related Projects

| Project | Description |
|---------|-------------|
| [CANNBot-Insight](https://github.com/newbietk/agent-insight) | Web app (Next.js) — full-featured session analysis with 6 tabs, CLI import tool, and cloud upload |
| [CANNBot-Cloud](https://github.com/newbietk/CANNBot-Cloud) | Cloud platform for session feedback and sharing |

## License

MIT
