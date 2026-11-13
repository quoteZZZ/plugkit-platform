// 后台 Service Worker：规则集应用 + 自动签到 + webRequest 观察计数
// 架构说明（纯 storage 驱动）：
//  - popup/options/content 直读直写 chrome.storage.local，本后台通过 storage.onChanged 感知设置变更；
//  - PCDN 拦截由浏览器内核 DNR 完成（rules_base 静态规则默认启用，即使后台休眠也生效）；
//  - 本后台保留：DNR 规则集/白名单应用、每日自动签到(alarms)、webRequest 计数落库、跨插件日志桥。
import { defineBackground } from 'wxt/utils/define-background';
import {
  clearLogs,
  createLogger,
  createStorage,
  getLogs,
  onExternalMessage,
  onMessage,
  PLUGKIT_CLEAR_LOGS_CHANNEL,
  PLUGKIT_STATUS_CHANNEL,
} from '@plugkit/core';
import { BiliSettings, BiliStats, DEFAULT_SETTINGS, DEFAULT_STATS, rollStats } from '../shared/types';
import { matchesPcdn, WEB_REQUEST_FILTER } from '../shared/rules';

/** 内部消息通道：content 请求后台用 chrome.downloads 落盘 */
const DOWNLOAD_CHANNEL = 'bili/download';

/** 「给视频 CDN 补 Referer」动态规则 id（与白名单规则的 9000 段错开） */
const REFERER_RULE_ID = 9100;

/** 需要补 Referer 的媒体域（必须被 host_permissions 覆盖） */
const MEDIA_DOMAINS = ['bilivideo.com', 'bilivideo.cn'];

export default defineBackground(() => {
  const logger = createLogger('bili-bg');
  const settingsStore = createStorage<BiliSettings>('bili:settings', DEFAULT_SETTINGS);
  const statsStore = createStorage<BiliStats>('bili:stats', DEFAULT_STATS);

  // 内存缓冲：webRequest 计数先入内存，定期/事件触发 flush（避免频繁写 storage）
  let buf = 0;
  /** buf 开始累积的时间戳：flush 时若早于用户清零时间(lastResetAt)，说明是清零前残留，丢弃 */
  let bufSince = Date.now();
  let settings: BiliSettings = { ...DEFAULT_SETTINGS };

  // 后台自诊断：最近捕获的错误（最多 5 条），写入 storage 供 UI 显示
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

  /** 把内存计数落库（daily 与今日项同步，跨天自动归零） */
  async function flush() {
    try {
      let stats = rollStats(await statsStore.get());
      // 用户清零发生在 buf 开始累积之后 → 丢弃这期间残留的计数，避免"清零后又涨回"
      if (buf > 0) {
        if (stats.lastResetAt && bufSince < stats.lastResetAt) {
          buf = 0;
        } else {
          stats.todayPcdn += buf;
          stats.totalPcdn += buf;
          buf = 0;
        }
      }
      await statsStore.set(rollStats(stats));
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
      // 显式标注 Rule 类型：`as const` 会把 resourceTypes 收窄成只读元组，与 Rule[] 不兼容
      const addRules = clean.map(
        (d, i): chrome.declarativeNetRequest.Rule => ({
          id: ALLOW_RULE_BASE + i,
          priority: 100,
          action: { type: 'allow' as chrome.declarativeNetRequest.RuleActionType },
          condition: {
            urlFilter: `||${d}`,
            resourceTypes: [
              'xmlhttprequest',
              'media',
              'websocket',
              'other',
              'ping',
            ] as chrome.declarativeNetRequest.ResourceType[],
          },
        }),
      );
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
      if (clean.length > 0) logger.info(`白名单已同步：${clean.join(', ')}`);
    } catch (e) {
      recordError('同步白名单', e);
    }
  }

  /**
   * 给视频 CDN 请求补 Referer。
   * chrome.downloads 发起的请求不带 Referer，而 bilivideo 会校验它——不补就是 403。
   * 仅在「下载视频」开启时启用，避免给不需要下载的用户平白多改请求头。
   */
  async function syncRefererRule(on: boolean): Promise<void> {
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules().catch(() => []);
      const has = existing.some((r) => r.id === REFERER_RULE_ID);
      if (on === has) return; // 幂等：状态没变就不动规则表
      const addRules = on
        ? ([
            {
              id: REFERER_RULE_ID,
              priority: 10,
              action: {
                type: 'modifyHeaders',
                requestHeaders: [
                  {
                    header: 'referer',
                    operation: 'set',
                    value: 'https://www.bilibili.com/',
                  },
                  { header: 'origin', operation: 'set', value: 'https://www.bilibili.com' },
                ],
              },
              condition: {
                requestDomains: MEDIA_DOMAINS,
                resourceTypes: ['media', 'xmlhttprequest', 'other'],
              },
            },
          ] as unknown as chrome.declarativeNetRequest.Rule[])
        : [];
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: has ? [REFERER_RULE_ID] : [],
        addRules,
      });
      logger.info(`CDN Referer 补偿：${on ? '已启用' : '已关闭'}`);
    } catch (e) {
      recordError('同步 Referer 规则', e);
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
    // 下载视频开启时才给 CDN 补 Referer（chrome.downloads 不带 Referer 会被 CDN 403）
    await syncRefererRule(s.videoDownload);
  }

  /** 每日签到（保守版：仅签到接口，不动投币/分享） */
  async function doCheckin(): Promise<{ ok: boolean; msg: string }> {
    try {
      const res = await fetch('https://api.bilibili.com/x/sign/doSign', {
        credentials: 'include',
      });
      const json = (await res.json()) as { code: number; message?: string; data?: { text?: string } };
      if (json.code === 0) return { ok: true, msg: json.data?.text ?? '签到成功' };
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
      // 心跳：记录后台启动状态，供 popup 诊断显示
      await chrome.storage.local
        .set({ 'plugkit:bili:heartbeat': { ts: Date.now(), ok: true } })
        .catch(() => {});
    } catch (e) {
      recordError('初始化', e);
      await chrome.storage.local
        .set({ 'plugkit:bili:heartbeat': { ts: Date.now(), ok: false, err: String(e) } })
        .catch(() => {});
    }
  })();

  // 设置变更驱动：popup/options/content 直写 storage 后，这里应用 DNR 规则集/白名单
  // （storage.onChanged 是唯一可靠的事件桥，防抖 300ms 合并连续变更）
  safeRegister('settingsWatch', () => {
    let watchTimer: number | undefined;
    settingsStore.watch((s) => {
      settings = s;
      if (watchTimer !== undefined) return;
      watchTimer = setTimeout(() => {
        watchTimer = undefined;
        void applyRulesets();
      }, 300) as unknown as number;
    });
  });

  // —— PCDN 请求计数（observe 模式，非阻塞）——
  safeRegister('webRequest', () => {
    chrome.webRequest.onBeforeRequest.addListener(
      (detail) => {
        // 白名单命中的请求不算拦截（已被 allow 规则放行），避免统计虚高
        if (settings.masterOn && !isAllowlisted(detail.url) && matchesPcdn(detail.url, settings.aggressive)) {
          if (buf === 0) bufSince = Date.now();
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

  // —— alarms：每日自动签到 ——
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

  // —— 下载桥：content 把直链交过来，由下载管理器落盘（不占页面内存）——
  safeRegister('downloadBridge', () => {
    onMessage<{ url: string; filename: string }, { ok: boolean; err?: string }>(
      DOWNLOAD_CHANNEL,
      async (req) => {
        try {
          if (!req?.url) return { ok: false, err: '缺少下载地址' };
          const id = await chrome.downloads.download({
            url: req.url,
            filename: req.filename || 'bilibili.mp4',
            saveAs: false,
            conflictAction: 'uniquify',
          });
          if (typeof id !== 'number') return { ok: false, err: '下载器未返回任务 id' };
          logger.info('已加入下载', req.filename);
          return { ok: true };
        } catch (e) {
          recordError('下载', e);
          return { ok: false, err: String(e) };
        }
      },
    );
  });

  // —— 跨插件状态桥：供 plugkit-manager 拉取本插件日志（保留跨插件消息，管理平台依赖）——
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
