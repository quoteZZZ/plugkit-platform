import { defineConfig } from 'wxt';

export default defineConfig({
  // 入口目录（显式声明，避免不同 WXT 版本默认路径差异）
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  // 启用 React（JSX 转换 + HMR）：以包名字符串形式声明模块
  modules: ['@wxt-dev/module-react'],
  // 跨平台：默认构建 Chromium 目标；`pnpm build:firefox` 产出 Firefox 目标
  manifest: {
    name: 'PlugKit Starter',
    description: '基于 PlugKit 基座的插件模板（演示消息/存储/平台/UI 全链路）',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['<all_urls>'],
  },
  // 对接规范：加 plugkit 字段，使本插件能被 plugkit-manager 平台识别与管理
  // （这就是"被管理插件最小接口"——只需在 manifest 声明 plugkit.suite）
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      (manifest as Record<string, unknown>).plugkit = {
        suite: 'plugkit',
        pluginId: 'starter',
        displayName: '示例插件',
        category: '演示',
      };
    },
  },
});
