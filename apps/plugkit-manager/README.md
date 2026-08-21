# PlugKit Manager（插件管理平台）

集中管理你用 PlugKit 开发的系列浏览器插件：列表总览、一键启用/禁用、打开配置页、卸载。

## 功能

- 枚举本机已安装的 PlugKit 系列插件（manifest 含 `plugkit.suite = "plugkit"`）
- 一键启用 / 禁用、打开各插件配置页、卸载（带确认）
- 无需联网，纯本地管理

## 安装（本地加载）

1. 构建：`pnpm -F @plugkit/plugin-manager build`
2. 浏览器打开 `chrome://extensions` → 右上角开启**开发者模式**
3. 点「加载已解压的扩展程序」→ 选择 `apps/plugkit-manager/.output/chrome-mv3`
4. 工具栏出现 PlugKit Manager 图标，点击即可看到系列插件列表

## 让新插件被管理

用 `pnpm create-plugkit <名字>` 生成的新插件自带 `plugkit` 标识，构建加载后自动出现在本插件列表。
手动方式：在插件的 `wxt.config.ts` 里加：

```ts
hooks: {
  'build:manifestGenerated': (wxt, manifest) => {
    (manifest as Record<string, unknown>).plugkit = {
      suite: 'plugkit',
      pluginId: '<你的id>',
      displayName: '<显示名>',
      category: '<分类>',
    };
  },
},
```

## 说明

- 卸载不可逆，请谨慎操作
- 需要 `management` 权限（读取与开关扩展）
