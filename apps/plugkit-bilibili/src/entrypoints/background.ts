// 后台 Service Worker：统计中枢 + 规则集开关 + 内容脚本上报汇聚 + 每日签到
// 设计要点（性能）：
//  - PCDN 拦截由浏览器内核 DNR 完成，后台零参与；
//  - 后台仅做轻事：webRequest 观察计数、content 上报落库、规则集开关、alarms 签到。
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

  /** 滚动今日统计（跨天自动归零今日项，累计保留） */
  function roll(stats: BiliStats): BiliStats {
    if (stats.today === todayStr()) return stats;
    return {
      ...DEFAULT_STATS,
      today: todayStr(),
      totalPcdn: stats.totalPcdn,
      totalP2pCalls: stats.totalP2pCalls,
      totalP2pBytes: stats.totalP2pBytes,
      totalAdRemoved: stats.totalAdRemoved,
    };
  }

  /** 把内存计数落库 */
  async function flush() {
    const stats = roll(await statsStore.get());
    if (buf > 0) {
      stats.todayPcdn += buf;
      stats.totalPcdn += buf;
      buf = 0;
    }
    await statsStore.set(stats);
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
        .catch((e) => logger.error('更新 DNR 规则集失败', e));
    }
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
      logger.error('初始化失败', e);
    }
  })();

  // —— 1) PCDN 请求计数（observe 模式，非阻塞）——
  chrome.webRequest.onBeforeRequest.addListener(
    (detail) => {
      if (settings.masterOn && matchesPcdn(detail.url, settings.aggressive)) {
        buf += 1;
        if (buf >= 20) void flush();
      }
    },
    WEB_REQUEST_FILTER,
  );

  // 定期落库 + SW 休眠前兜底
  setInterval(() => void flush(), 30_000);
  chrome.runtime.onSuspend?.addListener(() => void flush());

  // —— 2) alarms：每日签到 ——
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'plugkit-bili-checkin') {
      void settingsStore.get().then((s) => {
        if (s.autoCheckin) {
          void doCheckin().then((r) => logger.info('自动签到:', r.msg));
        }
      });
    }
  });

  // —— 3) 消息通道 ——
  p2pBlockedChannel.on(async (data) => {
    const stats = roll(await statsStore.get());
    stats.todayP2pCalls += data.calls;
    stats.totalP2pCalls += data.calls;
    stats.todayP2pBytes += data.bytes;
    stats.totalP2pBytes += data.bytes;
    await statsStore.set(stats);
  });

  adBlockedChannel.on(async ({ count }) => {
    const stats = roll(await statsStore.get());
    stats.todayAdRemoved += count;
    stats.totalAdRemoved += count;
    await statsStore.set(stats);
  });

  getStateChannel.on(async () => {
    await flush();
    const stats = await statsStore.get();
    const s = await settingsStore.get();
    const rulesets = await chrome.declarativeNetRequest.getEnabledRulesets().catch(() => []);
    const todayEstimatedMB = Math.round(stats.todayPcdn * s.avgChunkMB * 10) / 10;
    const totalEstimatedMB = Math.round(stats.totalPcdn * s.avgChunkMB * 10) / 10;
    return { stats, settings: s, enabledRulesets: rulesets, todayEstimatedMB, totalEstimatedMB };
  });

  setAggressiveChannel.on(async ({ on }) => {
    await settingsStore.set({ aggressive: on });
    await applyRulesets();
  });

  setMasterChannel.on(async ({ on }) => {
    await settingsStore.set({ masterOn: on });
    await applyRulesets();
  });

  setBlockP2pChannel.on(async ({ on }) => {
    await settingsStore.set({ blockP2p: on });
  });

  resetStatsChannel.on(async () => {
    buf = 0;
    await statsStore.set({ ...DEFAULT_STATS, today: todayStr() });
  });

  setChunkChannel.on(async ({ mb }) => {
    const v = Math.max(0.5, Math.min(20, mb));
    await settingsStore.set({ avgChunkMB: v });
  });

  updateSettingsChannel.on(async ({ patch }) => {
    await settingsStore.set(patch);
    if ('masterOn' in patch || 'aggressive' in patch) await applyRulesets();
  });

  checkinChannel.on(async () => doCheckin());

  // —— 4) 跨插件状态桥：供 plugkit-manager 拉取本插件日志 ——
  onExternalMessage(PLUGKIT_STATUS_CHANNEL, async () => {
    const logs = await getLogs();
    return {
      pluginId: 'bilibili',
      version: chrome.runtime.getManifest().version,
      logs,
    };
  });

  onExternalMessage(PLUGKIT_CLEAR_LOGS_CHANNEL, async () => {
    await clearLogs();
    return { ok: true };
  });
});
