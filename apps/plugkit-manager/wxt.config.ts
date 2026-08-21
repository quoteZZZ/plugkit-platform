import { defineConfig } from 'wxt';

export default defineConfig({
  // 入口目录（显式声明，避免不同 WXT 版本默认路径差异）
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  // 启用 React（JSX 转换 + HMR）：以包名字符串形式声明模块
  modules: ['@wxt-dev/module-react'],
  // 管理平台：只需 management（读/开关扩展）+ storage，不再需要注入网页的权限
  manifest: {
    name: 'PlugKit Manager（插件管理）',
    description: '集中管理你用 PlugKit 开发的系列浏览器插件：开关、配置、卸载',
    permissions: ['management', 'storage'],
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
    action: {
      default_title: 'PlugKit Manager',
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
    },
  },
  // 在最终 manifest 注入 plugkit 字段，用于被本平台（及更高层工具）识别
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      (manifest as Record<string, unknown>).plugkit = {
        suite: 'plugkit',
        pluginId: 'manager',
        displayName: '插件管理',
        category: '平台',
      };
    },
  },
});
