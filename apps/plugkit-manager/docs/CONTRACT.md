# PlugKit 插件管理平台 — 识别与对接契约（CONTRACT）

> 本文件定义 **plugkit-manager（插件管理平台插件）** 与 **被它管理的系列插件** 之间的识别与通信约定。
> 目标：让任意 PlugKit 系列插件"零改造或极少改造"即可被平台识别、开关、配置。

## 1. 识别约定（核心）

平台通过 `chrome.management.getAll()` 枚举本机已装扩展，按以下规则过滤出"本系列"插件：

- **被管理插件**必须在 `manifest.json` 中声明自定义字段：
  ```json
  "plugkit": {
    "suite": "plugkit",
    "pluginId": "my-plugin",
    "displayName": "我的插件",
    "category": "工具"
  }
  ```
- **平台过滤逻辑**：
  ```ts
  const all = await browser.management.getAll();
  const managed = all.filter(
    (ext) => (ext.manifest as any)?.plugkit?.suite === 'plugkit'
  );
  ```
- `chrome.management` 返回的 `ExtensionInfo.manifest` 是安装时的完整 manifest 对象，未知字段（如 `plugkit`）会被保留，可直接读取。

## 2. 被管理插件最小接口（对接规范）

要让插件被 plugkit-manager 管理，**只需做一件事**：在 manifest 加 `plugkit` 字段（见上）。

可选增强（非强制，按需）：

| 能力 | 实现方式 | 说明 |
|------|---------|------|
| 统一配置入口 | 提供 `options_ui` / `options_page` | 平台调用 `chrome.management.get(id)` 取 `optionsUrl` 并打开 |
| 日志监测 | background 用 `onExternalMessage` 暴露 `plugkit/getStatus` | 平台跨插件拉取该插件最近运行日志（见 §6） |
| 清空日志 | background 暴露 `plugkit/clearLogs` | 平台从日志视图一键清空该插件日志 |
| 远程配置 | 通过 `ext-core` 的 storage 命名空间 | 平台可写入共享配置键，插件读取 |

## 3. 平台能力 → 数据字段映射（MVP）

| 平台能力 | 数据来源 | 字段 |
|---------|---------|------|
| 列表总览 | `management.ExtensionInfo` | `name`, `version`, `enabled`, `icons`, `plugkit.displayName`, `plugkit.category` |
| 启用/禁用 | `management.setEnabled(id, bool)` | — |
| 打开配置 | `management.get(id).optionsUrl` | `optionsUrl` |
| 卸载 | `management.uninstall(id)` | — |

## 4. 非目标（明确不做）

- ❌ 版本更新检测 / 自动更新（需后端）
- ❌ 跨设备同步
- ❌ 管理非 `plugkit.suite === 'plugkit'` 的普通扩展
- ❌ 应用商店分发

## 5. 权限要求

- 平台插件需声明 `"permissions": ["management"]`
- 平台自身也带 `plugkit` 字段（自我标识，便于将来被更高层工具识别）

## 6. 跨插件日志监测协议（已实现）

平台（plugkit-manager）与被管理插件之间通过 **跨插件消息** 拉取运行日志：

- **通道**：`plugkit/getStatus`（查日志）、`plugkit/clearLogs`（清日志），均带 `__plugkit__` 信封标识。
- **被管理插件**：在 background 用 `onExternalMessage(PLUGKIT_STATUS_CHANNEL, ...)` 响应，返回：
  ```ts
  { pluginId: string; version: string; logs: LogEntry[] }
  ```
  其中 `LogEntry = { ts: number; level: 'debug'|'info'|'warn'|'error'; ns: string; msg: string }`。
- **平台**：用 `sendToExtension(pluginId, PLUGKIT_STATUS_CHANNEL, undefined)` 发起；自身（manager）直接读本地 storage，不走消息。
- **连接许可**：被管理插件**不声明** `externally_connectable` 时，Chrome 默认允许所有扩展连接；信封上的 `__plugkit__` 标识用于隔离，非本系列消息会被忽略。

核心实现位于 `packages/plugkit-core/src/{logger,messaging}`：`createLogger` 除输出 console 外，把最近 200 条日志防抖写入 `chrome.storage.local`（键 `plugkit:logs`），`getLogs()/clearLogs()` 供读取与清空。
