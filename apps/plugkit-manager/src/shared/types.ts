// 管理平台共享类型：设置结构 + 存储实例
import { createStorage } from '@plugkit/core';
import type { LogLevel } from '@plugkit/core';

/** 管理平台自身设置（持久化于 chrome.storage.local） */
export type HubSettings = {
  /** 列表中是否显示自身（管理插件） */
  showSelf: boolean;
  /** 是否自动刷新插件列表 */
  autoRefresh: boolean;
  /** 自动刷新间隔（秒） */
  refreshSeconds: number;
  /** 是否启用日志监测 */
  logMonitor: boolean;
  /** 每个插件展示的日志条数上限 */
  maxLogs: number;
  /** 日志最低级别（低于此级别的日志不显示） */
  minLogLevel: LogLevel;
}

export const DEFAULT_SETTINGS: HubSettings = {
  showSelf: true,
  autoRefresh: true,
  refreshSeconds: 5,
  logMonitor: true,
  maxLogs: 100,
  minLogLevel: 'info',
};

export const settingsStore = createStorage<HubSettings>('hub:settings', DEFAULT_SETTINGS);
