// 后台 Service Worker：统计中枢 + 规则集开关 + 内容脚本上报汇聚 + 每日签到
// 设计要点（性能）：
//  - PCDN 拦截由浏览器内核 DNR 完成，后台零参与；
//  - 后台仅做轻事：webRequest 观察计数、content 上报落库、规则集开关、alarms 签到。
// 健壮性：所有事件监听器经 safeRegister 注册——单个注册失败不影响其他功能；
//         捕获的异常记入 bgErrors 供 UI 展示，避免"后台无响应/加载中"黑盒。
import { defineBackground } from 'wxt/utils/define-background';
import {
  clearLogs,
  createLogger,
  createStorage,
  getLogs,
  onExternalMessage,
  PLUGKIT_CLEAR_LOGS_CHANNEL,
  PLUGKIT_STATUS_CHANNEL,
} from '@plugkit/core';
import {
  BiliSettings,
  BiliStats,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  CheckinResult,
  p2pBlockedChannel,
  adBlockedChannel,
  getStateChannel,
  setAggressiveChannel,
  setMasterChannel,
  setBlockP2pChannel,
  resetStatsChannel,
  setChunkChannel,
  updateSettingsChannel,
  checkinChannel,
  todayStr,
} from '../shared/types';
import { matchesPcdn, WEB_REQUEST_FILTER } from '../shared/rules';

export default defineBackground(() => {
  const logger = createLogger('bili-bg');
  const settingsStore = createStorage<BiliSettings>('bili:settings', DEFAULT_SETTINGS);
  const statsStore = createStorage<BiliStats>('bili:stats', DEFAULT_STATS);

  // 内存缓冲：webRequest 计数先入内存，定期/事件触发 flush（避免频繁写 storage）
  let buf = 0;
  let settings: BiliSettings = { ...DEFAULT_SETTINGS };

  // 后台自诊断：最近捕获的错误（最多 5 条），经 getState 返回给 UI
  const bgErrors: string[] = [];
  function recordError(tag: string, e: unknown): void {
    const msg = `${tag}: ${String(e ?? 'unknown')}`;
    bgErrors.push(msg);
    if (bgErrors.length > 5) bgErrors.shift();
    logger.error(msg);
  }

  /** 安全注册事件监听器：单个注册抛错不拖垮整个后台 */
  function safeRegister(tag: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      recordError(`注册失败(${tag})`, e);
    }
  }

  /** 确保 daily 含当天项并与 today* 同步；截断为最近 7 天 */
  function withDaily(stats: BiliStats): BiliStats {
    const t = stats.today;
    const daily = (stats.daily ?? []).slice();
    let last = daily[daily.length - 1];
    if (!last || last.date !== t) {
      last = { date: t, pcdn: 0, p2pBytes: 0, adRemoved: 0 };
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

  /** 滚动今日统计（跨天自动归零今日项，累计保留；跨天先把昨日数据落入 daily） */
  function roll(stats: BiliStats): BiliStats {
    const today = todayStr();
    if (stats.today === today) return withDaily(stats);
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
    return withDaily({
      ...DEFAULT_STATS,
      today,
      totalPcdn: stats.totalPcdn,
      totalP2pCalls: stats.totalP2pCalls,
      totalP2pBytes: stats.totalP2pBytes,
      totalAdRemoved: stats.totalAdRemoved,
      daily,
    });
  }

  /** 把内存计数落库（daily 与今日项同步） */
  async function flush() {
    try {
      const stats = roll(await statsStore.get());
      if (buf > 0) {
        stats.todayPcdn += buf;
        stats.totalPcdn += buf;
        buf = 0;
      }
      await statsStore.set(withDaily(stats));
    } catch (e) {
      recordError('flush', e);
    }
  }

  /** 白名单域名命中判断（URL 是否属于任一例外域名） */
  function isAllowlisted(url: string): boolean {
    return (settings.pcdnAllowlist ?? []).some((d) => d && url.includes(d));
  }

  /** 同步白名单动态 allow 规则：优先级高于 block 规则，命中即放行 */
  const ALLOW_RULE_BASE = 9000;
  async function syncAllowlist(domains: string[]): Promise<void> {
    const clean = (domains ?? [])
      .map((d) => d.trim().toLowerCase())
      .filter((d) => /^[a-z0-9.-]+$/.test(d));
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules().catch(() => []);
      const removeRuleIds = existing
        .map((r) => r.id)
        .filter((id) => id >= ALLOW_RULE_BASE);
      const addRules = clean.map((d, i) => ({
        id: ALLOW_RULE_BASE + i,
        priority: 100,
        action: { type: 'allow' as const },
        condition: {
          urlFilter: `||${d}`,
          resourceTypes: ['xmlhttprequest', 'media', 'websocket', 'other', 'ping'] as const,
        },
      }));
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
      if (clean.length > 0) logger.info(`白名单已同步：${clean.join(', ')}`);
    } catch (e) {
      recordError('同步白名单', e);
    }
  }

  /** 应用规则集启用状态（storage 为准，幂等） */
  async function applyRulesets() {
    const s = await settingsStore.get();
    settings = s;
    const want: string[] = s.masterOn
      ? s.aggressive
        ? ['rules_base', 'rules_aggressive']
        : ['rules_base']
      : [];
    const current = await chrome.declarativeNetRequest.getEnabledRulesets().catch(() => [] as string[]);
    const toEnable = want.filter((id) => !current.includes(id));
    const toDisable = current.filter((id) => !want.includes(id));
    if (toEnable.length > 0 || toDisable.length > 0) {
      await chrome.declarativeNetRequest
        .updateEnabledRulesets({
          enableRulesetIds: toEnable,
          disableRulesetIds: toDisable,
        })
        .catch((e) => recordError('更新规则集', e));
    }
    // 白名单与规则集同步
    await syncAllowlist(s.pcdnAllowlist);
  }

  /** 每日签到（保守版：仅签到接口，不动投币/分享） */
  async function doCheckin(): Promise<CheckinResult> {
    try {
      const res = await fetch('https://api.bilibili.com/x/sign/doSign', {
        credentials: 'include',
      });
      const json = (await res.json()) as { code: number; message?: string; data?: { text?: string } };
      if (json.code === 0) {
        return { ok: true, msg: json.data?.text ?? '签到成功' };
      }
      if (json.code === -101) return { ok: false, msg: '未登录 B 站，签到失败' };
      if (json.code === -111) return { ok: false, msg: '签到过于频繁或需刷新登录态' };
      return { ok: false, msg: json.message ?? `签到失败(code=${json.code})` };
    } catch (e) {
      return { ok: false, msg: `网络错误: ${String(e)}` };
    }
  }

  // —— 初始化 ——
  void (async () => {
    try {
      await applyRulesets();
      // 每日签到定时器（首次安装即创建，每天整点触发一次）
      const alarmName = 'plugkit-bili-checkin';
      const existed = await chrome.alarms.get(alarmName).catch(() => undefined);
      if (!existed) {
        await chrome.alarms.create(alarmName, { periodInMinutes: 24 * 60 }).catch(() => {});
      }
      logger.info('Bilibili 管理已初始化');
    } catch (e) {
      // 初始化失败不应拖垮整个后台（否则 popup 消息将永久无响应，表现为"一直加载中"）
      recordError('初始化', e);
    }
  })();

  // —— 1) PCDN 请求计数（observe 模式，非阻塞）——
  safeRegister('webRequest', () => {
    chrome.webRequest.onBeforeRequest.addListener(
      (detail) => {
        // 白名单命中的请求不算拦截（已被 allow 规则放行），避免统计虚高
        if (settings.masterOn && !isAllowlisted(detail.url) && matchesPcdn(detail.url, settings.aggressive)) {
          buf += 1;
          if (buf >= 20) void flush();
        }
      },
      WEB_REQUEST_FILTER,
    );
  });

  // 定期落库 + SW 休眠前兜底
  safeRegister('interval', () => setInterval(() => void flush(), 30_000));
  safeRegister('onSuspend', () => chrome.runtime.onSuspend?.addListener(() => void flush()));

  // —— 2) alarms：每日签到 ——
  safeRegister('alarms', () => {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'plugkit-bili-checkin') {
        void settingsStore.get().then((s) => {
          if (s.autoCheckin) {
            void doCheckin().then((r) => logger.info('自动签到:', r.msg));
          }
        });
      }
    });
  });

  // —— 3) 消息通道 ——
  safeRegister('p2pBlocked', () => {
    p2pBlockedChannel.on(async (data) => {
      try {
        const stats = roll(await statsStore.get());
        stats.todayP2pCalls += data.calls;
        stats.totalP2pCalls += data.calls;
        stats.todayP2pBytes += data.bytes;
        stats.totalP2pBytes += data.bytes;
        await statsStore.set(withDaily(stats));
      } catch (e) {
        recordError('p2pBlocked', e);
      }
    });
  });

  safeRegister('adBlocked', () => {
    adBlockedChannel.on(async ({ count }) => {
      try {
        const stats = roll(await statsStore.get());
        stats.todayAdRemoved += count;
        stats.totalAdRemoved += count;
        await statsStore.set(withDaily(stats));
      } catch (e) {
        recordError('adBlocked', e);
      }
    });
  });

  safeRegister('getState', () => {
    getStateChannel.on(async () => {
      // 全链路兜底：任何一步失败都返回安全快照 + 诊断，避免 sendMessage resolve undefined
      try {
        await flush().catch(() => {});
        const stats = await statsStore.get().catch(() => ({ ...DEFAULT_STATS }));
        const s = await settingsStore.get().catch(() => ({ ...DEFAULT_SETTINGS }));
        const rulesets = await chrome.declarativeNetRequest.getEnabledRulesets().catch(() => []);
        const todayEstimatedMB = Math.round(stats.todayPcdn * s.avgChunkMB * 10) / 10;
        const totalEstimatedMB = Math.round(stats.totalPcdn * s.avgChunkMB * 10) / 10;
        return {
          stats,
          settings: s,
          enabledRulesets: rulesets,
          todayEstimatedMB,
          totalEstimatedMB,
          bgErrors: bgErrors.slice(),
        };
      } catch (e) {
        recordError('getState', e);
        return {
          stats: { ...DEFAULT_STATS },
          settings: { ...DEFAULT_SETTINGS },
          enabledRulesets: [],
          todayEstimatedMB: 0,
          totalEstimatedMB: 0,
          bgErrors: bgErrors.slice(),
        };
      }
    });
  });

  safeRegister('setAggressive', () => {
    setAggressiveChannel.on(async ({ on }) => {
      await settingsStore.set({ aggressive: on });
      await applyRulesets();
    });
  });

  safeRegister('setMaster', () => {
    setMasterChannel.on(async ({ on }) => {
      await settingsStore.set({ masterOn: on });
      await applyRulesets();
    });
  });

  safeRegister('setBlockP2p', () => {
    setBlockP2pChannel.on(async ({ on }) => {
      await settingsStore.set({ blockP2p: on });
    });
  });

  safeRegister('resetStats', () => {
    resetStatsChannel.on(async () => {
      buf = 0;
      await statsStore.set(withDaily({ ...DEFAULT_STATS, today: todayStr() }));
    });
  });

  safeRegister('setChunk', () => {
    setChunkChannel.on(async ({ mb }) => {
      const v = Math.max(0.5, Math.min(20, mb));
      await settingsStore.set({ avgChunkMB: v });
    });
  });

  safeRegister('updateSettings', () => {
    updateSettingsChannel.on(async ({ patch }) => {
      await settingsStore.set(patch);
      if ('masterOn' in patch || 'aggressive' in patch || 'pcdnAllowlist' in patch) {
        await applyRulesets();
      }
    });
  });

  safeRegister('checkin', () => {
    checkinChannel.on(async () => doCheckin());
  });

  // —— 4) 跨插件状态桥：供 plugkit-manager 拉取本插件日志 ——
  safeRegister('externalStatus', () => {
    onExternalMessage(PLUGKIT_STATUS_CHANNEL, async () => {
      try {
        const logs = await getLogs();
        return {
          pluginId: 'bilibili',
          version: chrome.runtime.getManifest().version,
          logs,
        };
      } catch (e) {
        recordError('externalStatus', e);
        return { pluginId: 'bilibili', version: chrome.runtime.getManifest().version, logs: [] };
      }
    });
  });

  safeRegister('externalClearLogs', () => {
    onExternalMessage(PLUGKIT_CLEAR_LOGS_CHANNEL, async () => {
      try {
        await clearLogs();
        return { ok: true };
      } catch (e) {
        recordError('externalClearLogs', e);
        return { ok: false };
      }
    });
  });
});
