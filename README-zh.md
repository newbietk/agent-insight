# KirinAI-Insight

LLM 编码 Agent 的 Session 级可观测工具。辅助长上下文分析、模型幻觉问题治理，以及 Agent Session 中上下文窗口增长的监控与优化。

**[English Documentation](README.md)**

## 功能介绍

导入 opencode sessions.db 或 Claude Code JSONL 日志，逐轮分析 Agent Session：

- **Token 与费用** — 每轮 token 五项拆解柱状图，按模型上下文窗口显示占比；根据使用量和模型定价估算费用
- **上下文增长** — 按 subagent session 展示上下文增长曲线；动画回放 context window 变化过程，含 subagent 生成/消亡标记；`/compact` 压缩标记与上下文下降标注，支持多次压缩
- **上下文治理** — 查看 LLM 输入上下文组成：可见消息 + 稳定的 "System (hidden)" 开销；输入窗口在每个 `/compact` 边界正确截断
- **Subagent 追踪** — 识别 subagent session，构建 dispatch→response 链路；SVG 连线图展示主↔子关系
- **Skill 事件** — 跟踪每轮 skill load/invoke/use 事件
- **Workflow** — 按 workflow skill 自身的进程标记（非 thinking 输出里的 阶段一/二/三/四；"后续可继续执行阶段二"等未来时态忽略）划分阶段；skill 按其 dispatch root turn 落入对应阶段，所以只完成到 阶段一 的 session 就显示为单个 阶段一——并非每个 session 都跑完整 workflow。无标记时退化为家族间隔启发式
- **概念追踪** — 跨轮次关键词搜索，查看传播链路和 DAG 图
- **文件读取分析** — 分析文件读取冗余，检测重复和不必要读取
- **Session 对比** — 对比两个 session 的 token、费用、耗时、工具调用和 subagent

## 快速开始

三步完成首次 Session 分析。

### 1. 环境准备

- **Node.js >= 22.5**（内置 `node:sqlite` 模块需要此版本）。执行 `node -v` 检查。
- **npm**（随 Node.js 安装）。

Linux/macOS 下 `start.sh` 会自动检测 Node 版本并可通过 nvm 切换。Windows 下从 [nodejs.org](https://nodejs.org) 直接安装 Node 22+。

### 2. 克隆、安装、启动

```bash
git clone https://github.com/newbietk/KirinAI-Insight.git
cd kirinai-insight

# Linux / macOS / WSL — 一条命令：
./start.sh

# Windows (cmd / PowerShell) — 手动步骤：
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

浏览器打开 **http://localhost:21025**。

### 3. 导入首个 Session

在首页点击右上角 **"导入"** 按钮，可选择两种来源：

| 来源 | 典型路径 |
|------|---------|
| **Opencode** | `~/.local/share/opencode/opencode.db`（Linux）/ `%LOCALAPPDATA%\opencode\opencode.db`（Windows） |
| **Claude Code** | `~/.claude/projects/` — 选择项目目录，自动扫描所有 `.jsonl` 文件 |

选择来源类型，从列表中勾选 Session，点击 **导入**。导入完成后点击 Session 行进入 9 个分析 Tab 的完整视图。

> **提示**：也可以将 `.db` 或 `.jsonl` 文件直接拖拽到导入对话框中。

### 可选：上传到 KirinAI Cloud

如需将 Session 连同结构化反馈一起提交到云端平台：

1. 克隆并启动 [KirinAI-Cloud](https://github.com/newbietk/KirinAI-Cloud)，默认端口 21026
2. 将 `.env.example` 复制为 `.env`（默认已指向 `http://localhost:21026`）
3. 点击任意 Session 的 **上传** 按钮（云朵图标），打开反馈表单

## 方式一：VSCode 插件

无需离开编辑器即可分析 Session。VSCode 插件将 6 个分析 Tab 集成到侧边栏面板中。

**需要 VSCode >= 1.92.0**

### 安装

从 [Releases](https://github.com/newbietk/agent-insight/releases) 下载最新的 `.vsix` 文件：

- `Ctrl+Shift+P` → **Extensions: Install from VSIX...** → 选择文件
- 或从 [VSCode Marketplace](https://marketplace.visualstudio.com/) 安装（即将上线）

### 快速开始

1. 点击活动栏的 **图表图标**（📊）
2. 点击 **云下载图标** → **自动检测** `~/.claude/projects`（或选择 `.jsonl` 文件）
3. 点击任意 Session 打开 6 个分析 Tab 的详细面板

**6 个分析 Tab：** Overview（Token 趋势）· Turns（上下文组成）· Skills（技能事件）· File Reads（文件读取）· Subagents（子代理）· Breakdown（Token 拆解）

详细用法、配置、打包和开发指南请参见 [vscode-extension/README-zh.md](vscode-extension/README-zh.md)（[English](vscode-extension/README.md)）。

## 方式二：Web UI

**需要 Node.js >= 22.5**（内置 `node:sqlite` 模块需要此版本）。如果有 nvm，`start.sh` 会自动切换到 Node 22 LTS。

日志文件位置：
- opencode: `~/.local/share/opencode/sessions.db`
- Claude Code: `~/.claude/projects/<hash>/sessions/<id>.jsonl`，也可指定目录自动扫描

```bash
./start.sh              # 自动安装 + 迁移 + 启动 Web UI，端口 21025
./start.sh -u           # 更新依赖 + 迁移 + 启动 Web UI
./start.sh -f           # 清除 .next 缓存，重新编译
```

浏览器打开 `http://localhost:21025`。导入日志文件后，点击 session 进入 9 个分析 Tab。

Web UI 还支持：导出 session 为独立 SQLite 或层级 Markdown；上传 session 到 KirinAI Cloud（带结构化反馈表单）。

## 方式三：CLI 上传 + Web 分析

适用于 SSH 远程服务器、Web IDE 等无浏览器环境。CLI 一步完成导入和上传，之后在 Web UI 上分析。

日志文件位置：
- opencode: `~/.local/share/opencode/sessions.db`
- Claude Code: `~/.claude/projects/<hash>/sessions/<id>.jsonl`，也可指定目录自动扫描

```bash
# 从源文件一步上传（源类型根据文件自动识别）
npx tsx src/cli/index.ts upload --file ./sessions.db           # 多个 session 时交互式选择
npx tsx src/cli/index.ts upload --file ./logs/                 # Claude JSONL（目录）
```

上传后会交互式填写提交信息。后端自动启动，上传完成后自动关闭。

上传后在 Web UI 上查看分析：上传后 session 会自动导入本地 Insight DB，可直接开始分析。
