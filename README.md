# Desktop Robot

<div align="center">
  <img src="assets/robot.svg" alt="Desktop Robot" width="120">
  <br>
  <p>🤖 A cute desktop robot for macOS, built with Electron</p>
  <p>🤖 一个基于 Electron 构建的 macOS 桌面机器人</p>
</div>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

---

<h2 id="english">🇺🇸 English</h2>

### Features

- 🐾 **Cute Robot** — A floating desktop robot that stays on top of all windows.
- 💬 **AI Chat** — Built-in chat panel powered by OpenAI-compatible / Anthropic APIs.
- 📊 **System Monitor** — Real-time CPU, memory, network, disk, and process monitoring.
- 🔌 **Port Monitor** — Watch specific ports and view all listening services.
- 🖱️ **Interactive** — Click the robot to open chat, right-click for system menu.
- 🎨 **Transparent UI** — Frameless, click-through when not interacting.

### Prerequisites

- macOS
- Node.js >= 18

### Install & Run

```bash
npm install
npm start
```

### Project Structure

```
desktop-robot/
├── main.js                 # Electron bootstrap, window, tray, menu, shortcuts
├── preload.js              # Secure IPC bridge exposed to the renderer
├── lib/                    # Main-process modules (chat, search, secrets, monitors)
├── renderer.js             # Renderer bootstrap and cross-feature wiring
├── renderer-*.js           # Renderer feature modules (chat, settings, news, effects, etc.)
├── vendor/                 # Packaged browser runtime assets (Three.js wrapper)
├── index.html              # Main window HTML
├── style.css               # Styles
├── test/                   # Node test runner regression tests
└── assets/                 # Images & resources
```

### Validation

```bash
npm test
npm run pack
```

### Tech Stack

- [Electron](https://www.electronjs.org/)
- [uiohook-napi](https://github.com/Sunrise-Studio/uiohook-napi) — Global input hooks

### License

MIT

---

<h2 id="中文">🇨🇳 中文</h2>

### 功能特性

- 🐾 **可爱机器人** — 悬浮在所有窗口之上的桌面机器人。
- 💬 **AI 对话** — 支持 OpenAI 兼容 / Anthropic API 的内置聊天面板。
- 📊 **系统监控** — 实时查看 CPU、内存、网络、磁盘及进程信息。
- 🔌 **端口监控** — 监控指定端口，查看当前所有监听服务。
- 🖱️ **交互式操作** — 点击机器人打开聊天，右键呼出系统菜单。
- 🎨 **透明界面** — 无边框窗口，非交互区域可穿透点击。

### 环境要求

- macOS
- Node.js >= 18

### 安装与运行

```bash
npm install
npm start
```

### 项目结构

```
desktop-robot/
├── main.js                 # Electron 启动、窗口、托盘、菜单、快捷键
├── preload.js              # 暴露给渲染层的安全 IPC 桥
├── lib/                    # 主进程模块（聊天、搜索、密钥、监控）
├── renderer.js             # 渲染层启动与跨功能接线
├── renderer-*.js           # 渲染层功能模块（聊天、设置、新闻、特效等）
├── vendor/                 # 打包进应用的浏览器运行时资源（Three.js 包装）
├── index.html              # 主窗口 HTML
├── style.css               # 样式
├── test/                   # Node test runner 回归测试
└── assets/                 # 图片与资源
```

### 验证

```bash
npm test
npm run pack
```

### 技术栈

- [Electron](https://www.electronjs.org/)
- [uiohook-napi](https://github.com/Sunrise-Studio/uiohook-napi) — 全局输入钩子

### 开源协议

MIT
