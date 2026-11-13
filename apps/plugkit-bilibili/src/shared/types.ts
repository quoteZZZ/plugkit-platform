// 插件共享类型：统计结构 + 设置结构
// 所有端（background/content/popup/options）从同一处 import，保证类型一致
//
// 功能取舍原则：只保留「防止平台偷占带宽」与「日常观看」两类。
// 与带宽无关、价值低或与 B 站自带能力重复的功能已移除（详见 README）。

/** 单日统计（近 7 天趋势用） */
export type DayStat = {
  /** 日期 yyyy-mm-dd */
  date: string;
  /** 当日 PCDN 拦截请求数 */
  pcdn: number;
  /** 当日阻止上传字节数 */
  p2pBytes: number;
  /** 当日清理广告元素数 */
  adRemoved: number;
};

/** 拦截统计（持久化于 chrome.storage.local）——全部为实测值，不含估算 */
export type BiliStats = {
  /** 今日日期 yyyy-mm-dd（跨天自动滚动） */
  today: string;
  /** 今日拦截的 PCDN 请求数 */
  todayPcdn: number;
  /** 今日阻止的 WebRTC 上传调用次数 */
  todayP2pCalls: number;
  /** 今日阻止的 WebRTC 上传字节数 */
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
  /** 近 7 天每日统计（末项为今天） */
  daily: DayStat[];
  /** 最近一次成功阻止 P2P 上传的时间戳(ms)；null 表示从未拦截 */
  lastP2pBlock: number | null;
  /** 用户手动清零统计的时间戳(ms) */
  lastResetAt: number | null;
};

/** 插件设置（持久化于 chrome.storage.local） */
export type BiliSettings = {
  // —— 拦截（核心）——
  /** 总开关：PCDN 拦截 + 上传阻断 */
  masterOn: boolean;
  /** 激进档：连正常 CDN 一起拦，更快但可能影响加载 */
  aggressive: boolean;
  /** 阻止 WebRTC(P2P) 上行 */
  blockP2p: boolean;
  /** 例外域名：命中即放行（不拦截、不计入统计） */
  pcdnAllowlist: string[];
  // —— 页面净化 ——
  adClean: boolean;
  // —— 播放 ——
  playerEnhance: boolean;
  /** 固定倍速（0.1-16，1.0 表示不干预） */
  customSpeed: number;
  autoWidescreen: boolean;
  rememberProgress: boolean;
  /** 精确统计：把「1.2万播放」换成具体数字 */
  preciseStats: boolean;
  // —— 弹幕 ——
  danmaku: boolean;
  danmakuHotkey: string;
  danmakuOpacity: number;
  // —— 账号 ——
  /** 每日自动签到（chrome.alarms） */
  autoCheckin: boolean;
  // —— 夜间模式 ——
  nightMode: boolean;
  nightModeHotkey: string;
  // —— 下载 / 导出 ——
  coverDownload: boolean;
  videoDownload: boolean;
  danmakuExport: boolean;
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
  pcdnAllowlist: [],
  adClean: true,
  playerEnhance: true,
  customSpeed: 1.0,
  autoWidescreen: true,
  rememberProgress: true,
  preciseStats: true,
  danmaku: true,
  danmakuHotkey: 'Alt+D',
  danmakuOpacity: 100,
  autoCheckin: true,
  nightMode: false,
  nightModeHotkey: 'Alt+N',
  coverDownload: false,
  videoDownload: true,
  danmakuExport: false,
};

/**
 * 跨天滚动：任何读写 today* 的端在落库前都必须先调用本函数。
 * 若 stats.today 不是今天，则归零今日项、保留累计，并保证 daily 末项为今天。
 */
export function rollStats(stats: BiliStats): BiliStats {
  const today = todayStr();
  if (stats.today !== today) {
    // 跨天：把昨日数据落入 daily，今日项归零（累计保留）
    const daily = (stats.daily ?? []).slice();
    const yesterday = {
      date: stats.today,
      pcdn: stats.todayPcdn,
      p2pBytes: stats.todayP2pBytes,
      adRemoved: stats.todayAdRemoved,
    };
    const last = daily[daily.length - 1];
    if (last && last.date === stats.today) daily[daily.length - 1] = yesterday;
    else daily.push(yesterday);
    stats = {
      ...DEFAULT_STATS,
      today,
      totalPcdn: stats.totalPcdn,
      totalP2pCalls: stats.totalP2pCalls,
      totalP2pBytes: stats.totalP2pBytes,
      totalAdRemoved: stats.totalAdRemoved,
      daily,
      lastP2pBlock: stats.lastP2pBlock ?? null,
      lastResetAt: stats.lastResetAt ?? null,
    };
  }
  // 无论是否跨天，都同步 daily 末项为今天的实时值
  const daily = (stats.daily ?? []).slice();
  let last = daily[daily.length - 1];
  if (!last || last.date !== today) {
    last = { date: today, pcdn: 0, p2pBytes: 0, adRemoved: 0 };
    daily.push(last);
  } else {
    last = { ...last };
    daily[daily.length - 1] = last;
  }
  last.pcdn = stats.todayPcdn;
  last.p2pBytes = stats.todayP2pBytes;
  last.adRemoved = stats.todayAdRemoved;
  return { ...stats, daily: daily.slice(-7) };
}

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
  daily: [],
  lastP2pBlock: null,
  lastResetAt: null,
};

/** 签到结果 */
export interface CheckinResult {
  ok: boolean;
  msg: string;
}
