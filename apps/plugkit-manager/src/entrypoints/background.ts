// 后台 Service Worker：管理平台的后台中枢（事件驱动，空闲会被浏览器休眠）
// 职责：
//  - 启动日志 + 跨插件状态桥（供更高层工具/本平台自身读取日志）
//  - 被管理插件的开关/配置操作由 popup 直接用 chrome.management 完成，后台不参与
import { defineBackground } from 'wxt/utils/define-background';
import {
  clearLogs,
  createLogger,
  getLogs,
  onExternalMessage,
  PLUGKIT_CLEAR_LOGS_CHANNEL,
  PLUGKIT_STATUS_CHANNEL,
} from '@plugkit/core';

export default defineBackground(() => {
  const logger = createLogger('hub-bg');
  logger.info('PlugKit Hub 后台已启动');

  // 自身也暴露状态桥：让本平台（或更高层工具）按统一协议读取自身日志
  onExternalMessage(PLUGKIT_STATUS_CHANNEL, async () => {
    const logs = await getLogs();
    return {
      pluginId: 'manager',
      version: chrome.runtime.getManifest().version,
      logs,
    };
  });

  onExternalMessage(PLUGKIT_CLEAR_LOGS_CHANNEL, async () => {
    await clearLogs();
    return { ok: true };
  });
});
