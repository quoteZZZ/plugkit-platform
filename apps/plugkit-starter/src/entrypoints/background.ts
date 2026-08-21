// 后台 Service Worker：事件驱动、空闲会被浏览器休眠
// 用 defineBackground 包裹，业务逻辑写在 main() 内（保证只在浏览器环境执行）
import { defineBackground } from 'wxt/utils/define-background';
import {
  defineChannel,
  createLogger,
  clearLogs,
  getLogs,
  onExternalMessage,
  PLUGKIT_CLEAR_LOGS_CHANNEL,
  PLUGKIT_STATUS_CHANNEL,
} from '@plugkit/core';

export default defineBackground(() => {
  const logger = createLogger('bg');
  logger.info('Service Worker 已启动');

  // 定义并注册一个 PING 通道：popup 可发消息给后台
  const ping = defineChannel<void, { pong: true; time: number }>('PING');
  ping.on(() => {
    logger.debug('收到 PING');
    return { pong: true, time: Date.now() };
  });

  // 跨插件状态桥：供 plugkit-manager 拉取本插件日志
  onExternalMessage(PLUGKIT_STATUS_CHANNEL, async () => {
    const logs = await getLogs();
    return {
      pluginId: 'starter',
      version: chrome.runtime.getManifest().version,
      logs,
    };
  });

  onExternalMessage(PLUGKIT_CLEAR_LOGS_CHANNEL, async () => {
    await clearLogs();
    return { ok: true };
  });
});
