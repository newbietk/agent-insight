# CANNBot Insight - VSCode 插件

LLM 编码 Agent 的 Session 级可观测工具，集成到 VSCode 中。支持从 Claude Code、CodeAgent 3.0、OpenCode 导入 Session，在编辑器内直接分析 Token 用量、上下文增长、Skill 事件、文件操作和子代理。

**[English Documentation](README.md)**

## 功能介绍

**7 个分析 Tab** — 点击侧边栏任意 Session 即可打开详细 webview：

| Tab | 说明 |
|-----|------|
| **Overview** | 摘要卡片（Token、费用、延迟、模型）+ Token 趋势折线图，支持悬浮提示 |
| **Turns** | 轮次卡片含角色徽章、工具计数、技能标记；上下文组成堆叠柱状图（系统/用户/助手/工具/缓存）；可展开消息内容；调度轮次下方展示 **子代理通道** |
| **Trace** | 按关键词/工具/技能搜索轮次；概念传播链追踪 |
| **Context** | 多 Agent 上下文窗口使用率趋势图，按轮次序列展示各 Agent 的峰值与平均 |
| **Audit** | 流程框图 + 问题审计，通过粘贴 Claude Code 审计提示词生成的 JSON 渲染分析结果 |
| **Skills** | 技能调用时间线，展示事件类型（load/invoke/use）、成功率、每轮关联 |
| **File Ops** | 按文件读取分析，含冗余/重叠检测；文件操作时间线，可展开代码块和并排 diff 对比；文件列表分批展开（每次 10 个） |

**3 种数据源导入** — 每种均支持自动检测 + 手动导入两种模式：

| Agent | 自动检测路径 | 手动选项 |
|-------|-------------|---------|
| **Claude Code** | `~/.claude/projects/` | 选单个 `.jsonl` 或扫描目录 |
| **CodeAgent 3.0** | `~/.cac/projects/` | 选单个 `.jsonl` 或扫描目录 |
| **OpenCode** | `%APPDATA%/opencode/` (Windows), `~/.local/share/opencode/` (Linux) | 浏览 SQLite 数据库 → 选择 Session |

**子代理追踪** — bridges 基础设施链接调度 `Agent`/`Task` 工具调用到子代理 Session。子代理通道内联展示在根轮次下方，显示轮次数、Token 用量和调度提示。

**自动同步** — 可配置的后台同步，随 Claude Code 使用自动更新 Session 数据。

## 环境要求

- **VSCode >= 1.92.0**
- **Node.js >= 22**（插件内部通过 `sql.js` 使用 SQLite）

## 使用方式

### 从 VSIX 安装

1. 从 [Releases](https://github.com/newbietk/agent-insight/releases) 下载最新 `.vsix` 文件
2. 在 VSCode 中：`Ctrl+Shift+P` → **Extensions: Install from VSIX...** → 选择文件
3. 点击活动栏的 **图表图标**（📊）打开 CANNBot Insight 面板

### 导入 Session

1. 在 CANNBot Insight 侧边栏中，点击 **云下载图标**（📥）
2. 选择导入模式：**自动检测**或**手动导入**
3. 选择数据源（Claude Code / CodeAgent 3.0 / OpenCode）
4. 导入完成后，点击侧边栏任意 Session 打开 7 Tab 分析视图

### 侧边栏操作

| 图标 | 操作 |
|------|------|
| 📥 | 导入新 Session |
| 🔄 | 刷新 Session 列表 |
| 🔄✨ | 从数据源同步所有 Session |

每个 Session 行支持：
- 👁 **打开** — 打开分析面板
- 🔄 **同步** — 重新导入该 Session 最新数据
- 🗑 **删除** — 从本地存储中移除

### 配置项

打开 VSCode 设置（`Ctrl+,`）→ 搜索 "CANNBot Insight"：

| 设置项 | 默认值 | 说明 |
|---------|---------|------|
| `hismartlite.claudeProjectsPath` | `""` | 自定义 Claude Code 项目目录路径（留空 = 自动检测 `~/.claude/projects/`） |
| `hismartlite.cloudUrl` | `""` | CANNBot Cloud 服务地址 |
| `hismartlite.autoSync.enabled` | `false` | 启用后台自动同步 Session |
| `hismartlite.autoSync.intervalMs` | `30000` | 同步间隔（毫秒） |

## 打包发布

### 构建 VSIX

```bash
cd vscode-extension
npm install
npm run compile
npm run copy-assets
npx @vscode/vsce package
```

生成 `cannbot-insight-<版本号>.vsix` 在当前目录。

### 验证打包内容

```bash
npx @vscode/vsce ls
npx @vscode/vsce package --dry-run
```

## 开发调试

```bash
cd vscode-extension
npm install
npm run compile

# 监听模式
npm run watch

# 调试：在 VSCode 中打开 vscode-extension/ 文件夹，按 F5
```

### 项目结构

```
vscode-extension/
├── src/
│   ├── core/                  # 数据处理管线
│   │   ├── claude-jsonl.ts    # Claude Code JSONL 适配器
│   │   ├── opencode-db.ts     # OpenCode SQLite 适配器
│   │   ├── normalize.ts       # 数据规范化
│   │   ├── turn-split.ts      # Turn/ToolCall/SkillEvent 提取
│   │   ├── cost-calculator.ts # 模型定价与费用估算
│   │   └── context-window-config.ts  # 模型上下文窗口限制
│   ├── storage/
│   │   └── db.ts              # SQLite 存储 (sql.js)
│   ├── views/
│   │   ├── sessionTree.ts     # 侧边栏 TreeDataProvider
│   │   └── sessionPanel.ts    # Webview 面板管理器
│   ├── media/
│   │   ├── webviewContent.ts  # HTML/CSS/JS 模板生成器
│   │   ├── shared.ts          # 共享工具
│   │   ├── nav.ts             # Tab 导航运行时
│   │   ├── theme.ts           # VS Code 主题变量同步
│   │   └── tabs/              # 各 Tab 渲染函数
│   │       ├── overview.ts    # Token 趋势图
│   │       ├── turns.ts       # 轮次卡片 + 上下文组成 + 子代理通道
│   │       ├── trace.ts       # 搜索 + 传播链
│   │       ├── context.ts     # 多 Agent 上下文增长图
│   │       ├── audit.ts       # 流程审计框图
│   │       ├── skills.ts      # 技能事件时间线
│   │       └── fileops.ts     # 文件操作审计 + 按文件分析
│   ├── sync/
│   │   └── scheduler.ts       # 自动同步调度器
│   ├── i18n/                  # 国际化（英文、简体中文）
│   ├── extension.ts          # 插件入口
│   └── importer.ts           # 导入编排 + Bridge 提取
├── package.json               # 插件清单
├── tsconfig.json
└── README.md
```

## 开源协议

MIT
