// 插件共享类型：统计结构 + 设置结构
// 所有端（background/content/popup/options）从同一处 import，保证类型一致
// 说明：已改为纯 storage 驱动（chrome.storage.local 直读直写），不再使用消息通道

/** 单日拦截统计（近 7 天趋势用） */
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
  /** 近 7 天每日统计（末项为今天，随 today* 实时同步） */
  daily: DayStat[];
  /** 最近一次成功阻止 P2P 上传的时间戳(ms)；null 表示从未拦截（用于可验证性展示） */
  lastP2pBlock: number | null;
  /** 用户手动清零统计的时间戳(ms)；null 表示从未清零（后台 flush 据此丢弃清零前累积的 buf） */
  lastResetAt: number | null;
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
  /** 例外域名白名单：命中域名不拦截（逗号分隔存储为数组） */
  pcdnAllowlist: string[];
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
  /** 播放页把模糊统计（1.2万播放等）替换为精确值 */
  preciseStats: boolean;
  /** 播放页显示清晰度/编码信息 */
  showVideoInfo: boolean;
  // —— 弹幕管理 ——
  /** 弹幕管理总开关（快捷键/透明度） */
  danmaku: boolean;
  /** 弹幕快捷键（格式：Ctrl/Alt/Shift+按键，如 Alt+D） */
  danmakuHotkey: string;
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
  /** 播放页显示复制标题+链接按钮 */
  copyLinkButton: boolean;
  // —— 夜间模式 ——
  /** 夜间模式总开关（覆盖 B站浅色为暗色主题） */
  nightMode: boolean;
  /** 夜间模式快捷键（默认 Alt+N） */
  nightModeHotkey: string;
  // —— 下载 / 导出 ——
  /** 播放页显示「下载封面」按钮（保存到本地） */
  coverDownload: boolean;
  /** 播放页显示「下载视频」按钮（当前画质直链下载） */
  videoDownload: boolean;
  /** 播放页显示「下载字幕」按钮（Srt 下载） */
  subtitleDownload: boolean;
  /** 播放页显示「导出弹幕」按钮（XML 下载） */
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
  avgChunkMB: 2,
  adClean: true,
  playerEnhance: true,
  customSpeed: 1.0,
  autoWidescreen: true,
  rememberProgress: true,
  autoPlay: false,
  preciseStats: true,
  showVideoInfo: true,
  danmaku: true,
  danmakuHotkey: 'Alt+D',
  danmakuOpacity: 100,
  accountTools: true,
  autoCheckin: true,
  showOwnerLocation: true,
  coverButton: true,
  copyLinkButton: true,
  nightMode: false,
  nightModeHotkey: 'Alt+N',
  coverDownload: true,
  videoDownload: true,
  subtitleDownload: true,
  danmakuExport: true,
};

/**
 * 跨天滚动：统一修复"非当天数据"问题。
 * 任何读写 today* 的端（content / background / popup / options）在落库前都必须先调用本函数，
 * 确保：若 stats.today 不是今天，则归零今日项并保留累计；并保证 daily 末项始终为今天。
 * 此前该逻辑仅存在于 background 的 roll()，而 content script 直写 today* 从不滚动，
 * 导致 SW 休眠跨天后"今天"卡在昨天，F5 唤醒后台才归零。
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

/** 状态快照：popup / options 读取用 */
export interface StateSnapshot {
  stats: BiliStats;
  settings: BiliSettings;
  /** 当前实际启用的 DNR 规则集 */
  enabledRulesets: string[];
  /** 估算省流量（MB）：今日 / 累计 */
  todayEstimatedMB: number;
  totalEstimatedMB: number;
  /** 后台自诊断：最近捕获的后台错误（用于 UI 定位问题） */
  bgErrors?: string[];
}

/** 签到结果 */
export interface CheckinResult {
  ok: boolean;
  msg: string;
}
