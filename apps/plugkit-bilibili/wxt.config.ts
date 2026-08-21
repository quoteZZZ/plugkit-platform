// PlugKit Bilibili（B站管理）：拦截 + 净化 + 播放增强 + 弹幕管理 + 账号工具
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PlugKit Bilibili（B站管理）',
    description: 'B 站统一管理：PCDN/直播上传拦截、广告净化、播放增强、弹幕管理、账号工具与流量统计',
    permissions: ['declarativeNetRequest', 'webRequest', 'storage', 'alarms'],
    host_permissions: [
      '*://*.bilibili.com/*',
      '*://*.bilivideo.cn/*',
      '*://*.bilivideo.com/*',
      '*://*.biliapi.net/*',
      '*://*.szbdyd.com/*',
      '*://*.onethingpcs.com/*',
      '*://*.yfcdn.net/*',
      '*://*.ppio.cloud/*',
    ],
    declarative_net_request: {
      rule_resources: [
        { id: 'rules_base', enabled: true, path: 'rules_base.json' },
        { id: 'rules_aggressive', enabled: false, path: 'rules_aggressive.json' },
      ],
    },
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
    action: {
      default_title: 'B站管理',
      default_popup: 'popup.html',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' },
    },
  },
  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      (manifest as Record<string, unknown>).plugkit = {
        suite: 'plugkit',
        pluginId: 'bilibili',
        displayName: 'B站管理',
        category: '管理',
      };
    },
  },
});
