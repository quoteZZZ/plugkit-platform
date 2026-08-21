// 插件共享类型：统计结构 + 设置结构 + 消息通道定义
// 所有端（background/content/popup/options）从同一处 import，保证类型一致
import { defineChannel } from '@plugkit/core';

/** 拦截统计（持久化于 chrome.storage.local） */
export type BiliStats = {
  /** 今日日期 yyyy-mm-dd（跨天自动滚动） */
  today: string;
  /** 今日拦截的 PCDN 请求数（精确） */
  todayPcdn: number;
  /** 今日阻止的 WebRTC 上传调用次数（精确） */
  todayP2pCalls: number;
  /** 今日阻止的 WebRTC 上传字节数（精确） */
  todayP2pBytes: number;
  /** 今日清理的广告元素数 */
  todayAdRemoved: number;
  /** 累计 PCDN 请求数 */
  totalPcdn: number;
  /** 累计阻止上传调用次数 */
  totalP2pCalls: number;
  /** 累计阻止上传字节数 */
  totalP2pBytes: number;
  /** 累计清理广告元素数 */
  totalAdRemoved: number;
};

/** 插件设置（持久化于 chrome.storage.local） */
export type BiliSettings = {
  // —— 拦截（保留既有）——
  /** 总开关：是否启用 PCDN 拦截 */
  masterOn: boolean;
  /** 激进档：拦截全部 *.bilivideo.cn / pcdn.biliapi.net 等 */
  aggressive: boolean;
  /** 是否阻止直播 WebRTC(P2P) 上传 */
  blockP2p: boolean;
  /** 估算用平均视频分片大小（MB） */
  avgChunkMB: number;
  // —— 页面净化 ——
  /** 广告/推广元素清理 */
  adClean: boolean;
  // —— 播放增强 ——
  /** 播放增强总开关 */
  playerEnhance: boolean;
  /** 自定义倍速（0.1-16，1.0 表示不干预） */
  customSpeed: number;
  /** 自动宽屏 */
  autoWidescreen: boolean;
  /** 记忆播放进度（按 bvid） */
  rememberProgress: boolean;
  /** 自动播放 */
  autoPlay: boolean;
  // —— 弹幕管理 ——
  /** 弹幕管理总开关（快捷键/透明度） */
  danmaku: boolean;
  /** 弹幕透明度（10-100，100 为原样） */
  danmakuOpacity: number;
  // —— 账号工具 ——
  /** 账号工具总开关 */
  accountTools: boolean;
  /** 每日自动签到（chrome.alarms） */
  autoCheckin: boolean;
  /** 播放页显示 UP 主属地 */
  showOwnerLocation: boolean;
  /** 播放页显示封面获取按钮 */
  coverButton: boolean;
};

/** 今日日期 yyyy-mm-dd */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const DEFAULT_SETTINGS: BiliSettings = {
  masterOn: true,
  aggressive: false,
  blockP2p: true,
  avgChunkMB: 2,
  adClean: true,
  playerEnhance: true,
  customSpeed: 1.0,
  autoWidescreen: true,
  rememberProgress: true,
  autoPlay: false,
  danmaku: true,
  danmakuOpacity: 100,
  accountTools: true,
  autoCheckin: true,
  showOwnerLocation: true,
  coverButton: true,
};

export const DEFAULT_STATS: BiliStats = {
  today: todayStr(),
  todayPcdn: 0,
  todayP2pCalls: 0,
  todayP2pBytes: 0,
  todayAdRemoved: 0,
  totalPcdn: 0,
  totalP2pCalls: 0,
  totalP2pBytes: 0,
  totalAdRemoved: 0,
};

/** 状态快照：popup / options 读取用 */
export interface StateSnapshot {
  stats: BiliStats;
  settings: BiliSettings;
  /** 当前实际启用的 DNR 规则集 */
  enabledRulesets: string[];
  /** 估算省流量（MB）：今日 / 累计 */
  todayEstimatedMB: number;
  totalEstimatedMB: number;
}

/** 签到结果 */
export interface CheckinResult {
  ok: boolean;
  msg: string;
}

// —— 消息通道（类型化，复用 @plugkit/core messaging）——

/** content → background：上报阻止的 WebRTC 上传（content 端已聚合，低频） */
export const p2pBlockedChannel = defineChannel<{ bytes: number; calls: number }, void>(
  'bili/p2pBlocked',
);

/** content → background：上报清理的广告数 */
export const adBlockedChannel = defineChannel<{ count: number }, void>('bili/adBlocked');

/** popup/options → background：读取状态快照 */
export const getStateChannel = defineChannel<void, StateSnapshot>('bili/getState');

/** options → background：切换激进档 */
export const setAggressiveChannel = defineChannel<{ on: boolean }, void>('bili/setAggressive');

/** popup/options → background：总开关（PCDN 拦截） */
export const setMasterChannel = defineChannel<{ on: boolean }, void>('bili/setMaster');

/** options → background：阻止直播上传开关 */
export const setBlockP2pChannel = defineChannel<{ on: boolean }, void>('bili/setBlockP2p');

/** options → background：清零统计 */
export const resetStatsChannel = defineChannel<void, void>('bili/resetStats');

/** options → background：设置估算分片大小 */
export const setChunkChannel = defineChannel<{ mb: number }, void>('bili/setChunk');

/** popup/options → background：通用设置更新（功能开关/参数） */
export const updateSettingsChannel = defineChannel<{ patch: Partial<BiliSettings> }, void>(
  'bili/updateSettings',
);

/** popup → background：立即执行每日签到 */
export const checkinChannel = defineChannel<void, CheckinResult>('bili/checkin');
