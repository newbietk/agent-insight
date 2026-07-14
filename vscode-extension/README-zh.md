# KirinAI Insight - VSCode 插件

LLM 编码 Agent 的 Session 级可观测工具，集成到 VSCode 中。导入 Claude Code JSONL Session，在编辑器内直接分析 Token 用量、上下文增长、Skill 事件、Subagent 等。

**[English Documentation](README.md)**

## 功能介绍

**6 个分析 Tab** — 点击侧边栏任意 Session 即可打开详细 webview：

| Tab | 说明 |
|-----|------|
| **Overview** | Token 趋势图，支持悬浮 Tooltip 查看轮次详情；模型/费用摘要 |
| **Turns** | 轮次卡片 + 上下文组成拆解 — System Prompt（不可见）、User、Assistant、Tool 消息以堆叠柱状图展示；点击任意分段可展开查看完整消息内容 |
| **Skills** | 每轮 Skill 的 load/invoke/use 事件及耗时 |
| **File Reads** | 检测重复和不必要的文件读取 |
| **Subagents** | Subagent Session 追踪，含父子关系图 |
| **Breakdown** | Token 组成堆叠图（输入/输出/缓存），按轮次展示 |

**导入来源：**
- **自动检测** Claude Code 项目目录（`~/.claude/projects/`）
- **直接选择 .jsonl 文件**
- **扫描目录** 批量导入所有 `.jsonl` 文件

**自动同步** — 可配置的后台同步，随 Claude Code 使用自动更新 Session 数据。

## 环境要求

- **VSCode >= 1.92.0**
- **Node.js >= 22**（插件内部通过 `node:sqlite` 使用 SQLite）

## 使用方式

### 从 VSIX 安装

1. 从 [Releases](https://github.com/newbietk/agent-insight/releases) 下载最新 `.vsix` 文件
2. 在 VSCode 中：`Ctrl+Shift+P` → **Extensions: Install from VSIX...** → 选择文件
3. 点击活动栏的 **图表图标**（📊）打开 KirinAI 面板

### 导入 Session

1. 在 KirinAI 侧边栏中，点击 **云下载图标**（📥）
2. 选择导入方式：
   - **自动检测** `~/.claude/projects`（推荐）— 扫描 Claude Code 项目目录
   - **导入 .jsonl 文件** — 选择单个 Session 文件
   - **扫描目录** — 批量导入目录中所有 `.jsonl` 文件
3. 导入完成后，点击侧边栏任意 Session 打开 6 Tab 分析视图

### 侧边栏操作

| 图标 | 操作 |
|------|------|
| 📥 | 导入新 Session |
| 🔄 | 刷新 Session 列表 |
| 🔄✨ | 从 Claude Code 项目同步所有 Session |

每个 Session 行支持：
- 👁 **打开** — 打开分析面板
- 🔄 **同步** — 重新导入该 Session 最新数据
- 🗑 **删除** — 从本地存储中移除

### 配置项

打开 VSCode 设置（`Ctrl+,`）→ 搜索 "KirinAI"：

| 设置项 | 默认值 | 说明 |
|---------|---------|------|
| `kirinai.claudeProjectsPath` | `""` | 自定义 Claude Code 项目目录路径（留空 = 自动检测 `~/.claude/projects/`） |
| `kirinai.cloudUrl` | `http://localhost:21026` | KirinAI Cloud 服务地址，用于上传/同步 |
| `kirinai.autoSync.enabled` | `false` | 启用后台自动同步 Session |
| `kirinai.autoSync.intervalMs` | `30000` | 同步间隔（毫秒，最小 10000） |

## 打包发布

### 构建 VSIX（开发环境）

```bash
cd vscode-extension
npm install
npm run compile
npm run copy-assets

# 全局安装 vsce（仅需一次）
npm install -g @vscode/vsce

# 打包为 .vsix
vsce package
```

生成 `kirinai-insight-<版本号>.vsix` 在当前目录。

### 无需全局安装的打包方式

```bash
cd vscode-extension
npm install
npm run compile
npm run copy-assets
npx @vscode/vsce package
```

### 验证打包内容

```bash
# 列出 VSIX 中包含的文件
npx @vscode/vsce ls

# 检查缺失文件或问题（不实际打包）
npx @vscode/vsce package --dry-run
```

### 发布到 Marketplace

```bash
# 登录（仅需一次，需要 Azure DevOps Personal Access Token）
npx @vscode/vsce login kirinai

# 发布
npx @vscode/vsce publish

# 或以 pre-release 发布
npx @vscode/vsce publish --pre-release
```

## 开发调试

```bash
cd vscode-extension
npm install
npm run compile

# 监听模式（文件变更自动编译）
npm run watch

# 调试
# 1. 在 VSCode 中打开 vscode-extension/ 文件夹
# 2. 按 F5 → 启动 Extension Development Host
# 3. KirinAI 侧边栏图标出现在活动栏中
```

### 项目结构

```
vscode-extension/
├── src/
│   ├── core/                  # 数据处理管线（与 Web 应用共享）
│   │   ├── claude-jsonl.ts    # Claude Code JSONL 适配器
│   │   ├── normalize.ts       # 数据规范化
│   │   ├── turn-split.ts      # Turn/ToolCall/SkillEvent 提取
│   │   ├── cost-calculator.ts # 模型定价与费用估算
│   │   └── context-window-config.ts  # 模型上下文窗口限制
│   ├── storage/
│   │   └── db.ts              # SQLite 存储 (node:sqlite)
│   ├── views/
│   │   ├── sessionTree.ts     # 侧边栏 TreeDataProvider
│   │   └── sessionPanel.ts    # Webview 面板管理器
│   ├── media/
│   │   ├── webviewContent.ts  # HTML/CSS/JS 模板生成器
│   │   ├── shared.ts          # 共享工具（转义、JSON 安全序列化）
│   │   ├── nav.ts             # Tab 导航运行时
│   │   ├── theme.ts           # VS Code 主题变量同步
│   │   └── tabs/              # 各 Tab 渲染函数 + JS
│   │       ├── overview.ts    # Token 趋势图 + 悬浮提示
│   │       ├── turns.ts       # 轮次卡片 + 上下文组成
│   │       ├── breakdown.ts   # Token 组成堆叠图
│   │       ├── skills.ts      # Skill 事件时间线
│   │       ├── filereads.ts   # 文件读取分析
│   │       └── subagents.ts   # Subagent 关系图
│   ├── sync/
│   │   └── scheduler.ts       # 自动同步调度器
│   ├── i18n/                  # 国际化（英文、简体中文）
│   ├── extension.ts          # 插件入口
│   └── importer.ts           # 导入编排
├── package.json               # 插件清单 + VSCode 贡献点
├── tsconfig.json
└── README.md
```

### VSIX 包含的文件

由 `.vscodeignore`（或 `package.json` 中的 `files` 字段）控制。当前打包包含：
- `out/` — 编译后的 JavaScript
- `src/media/*.png`、`src/media/*.svg` — Webview 图标/图片

## 相关项目

| 项目 | 说明 |
|---------|-------------|
| [KirinAI-Insight](https://github.com/newbietk/agent-insight) | Web 应用（Next.js）— 完整功能的 Session 分析，含 CLI 导入工具和云端上传 |
| [KirinAI-Cloud](https://github.com/newbietk/KirinAI-Cloud) | 云端平台，用于 Session 反馈与分享 |

## 开源协议

MIT
