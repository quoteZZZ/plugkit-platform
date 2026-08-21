# PlugKit Starter — 新插件开发模板

> 本目录是 **PlugKit 快速开发脚手架** 的模板源。不要直接改它开发；请用命令生成你的插件：

```bash
cd plugkit-platform
pnpm create-plugkit <name> --display-name "插件名" --category 分类
# 例：pnpm create-plugkit douyin --display-name "抖音净化" --category 工具
```

生成后会自动改写包名、显示名、分类与 `plugkit.pluginId`，并正确写入跨插件日志桥。

## 目录结构

```
src/
├── entrypoints/
│   ├── background.ts      # 后台 Service Worker：消息通道、定时任务、跨插件状态桥
│   ├── content.ts         # Content Script：注入网页 DOM（如需，改 matches 范围）
│   ├── popup/             # 工具栏弹窗（React）
│   └── options/           # 设置页（React）
```

## 核心约定（务必遵循）

1. **复用 `@plugkit/core`**，不要重复造轮子：
   - `defineChannel` / `sendMessage`：类型化消息（background ↔ popup ↔ content）
   - `createStorage(namespace, defaults)`：带命名空间的强类型存储（自动加 `plugkit:` 前缀）
   - `createLogger`：分级日志，自动写入环形缓冲，**供插件平台跨插件读取**
   - `createBackground` / `createContentScript`：入口封装
   - `@plugkit/core/ui`：Popup / OptionsPage / Field / Toggle / Button / StatCard / Badge / SectionTitle
2. **manifest 必须带 `plugkit` 字段**（wxt.config.ts 的 hooks 已自动注入）——这是被插件平台识别的最小接口：
   ```json
   "plugkit": { "suite": "plugkit", "pluginId": "xxx", "displayName": "xxx", "category": "xxx" }
   ```
3. **跨插件日志桥必须保留**：background 中 `onExternalMessage(PLUGKIT_STATUS_CHANNEL / PLUGKIT_CLEAR_LOGS_CHANNEL)` 不能删，否则插件平台无法查看本插件日志。
4. **性能**：content script 内不要引 React 与重依赖；高频上报走聚合/长连接。
5. **跨平台**：只用通用浏览器 API；差异封进 `@plugkit/core` 的 platform 层。

## 常用命令

```bash
pnpm -F @plugkit/plugin-<name> dev          # 开发（HMR）
pnpm -F @plugkit/plugin-<name> build        # 构建 chrome-mv3
pnpm -F @plugkit/plugin-<name> build:firefox # 构建 firefox
pnpm -F @plugkit/plugin-<name> typecheck    # 类型检查
```

构建后进入 `apps/plugkit-<name>/.output/chrome-mv3`，在 `chrome://extensions` 加载解压扩展即用。

## 接入插件平台

安装并启用 **PlugKit 插件平台** 扩展后，本插件会自动出现在其列表（开关/配置/卸载/日志监测）。
