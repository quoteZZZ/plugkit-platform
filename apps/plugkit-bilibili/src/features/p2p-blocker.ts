// feature: 直播 P2P(WebRTC DataChannel) 上传阻止
// 由 content.ts(document_start) 加载——必须尽早 hook，故保持独立、精小（不引 React）
// 统计上报：直写 chrome.storage.local（纯 storage 驱动，不走消息通道）
import { createStorage } from '@plugkit/core';
import { BiliSettings, BiliStats, DEFAULT_SETTINGS, DEFAULT_STATS, rollStats } from '../shared/types';

const STATS_KEY = 'plugkit:bili:stats';

export function startP2pBlocker(): void {
  const settingsStore = createStorage<BiliSettings>('bili:settings', DEFAULT_SETTINGS);
  const proto = window.RTCDataChannel?.prototype;
  if (!proto || typeof proto.send !== 'function') return;

  // 开关状态：storage 为准；document_start 异步读取前的兜底默认开。
  // 设计意图：阻止上传是安全敏感操作，读取设置完成前宁可误拦（默认 true）
  // 也不放行，避免"用户已关闭开关却因竞态泄漏上行数据"；storage.get 为异步，
  // 无法在 document_start 同步消除该窗口，故保守优先。
  let block = true;
  void settingsStore.get().then((s) => {
    block = s.masterOn && s.blockP2p;
  });
  settingsStore.watch((s) => {
    block = s.masterOn && s.blockP2p;
  });

  const origSend = proto.send;
  let accBytes = 0;
  let accCalls = 0;
  let timer: number | undefined;

  /** 直写 stats storage（读改写合并，失败静默——统计非关键路径） */
  async function persistStats(update: (stats: BiliStats) => void): Promise<void> {
    try {
      const raw = await chrome.storage.local.get(STATS_KEY);
      let stats = { ...DEFAULT_STATS, ...(raw[STATS_KEY] ?? {}) } as BiliStats;
      stats = rollStats(stats); // 跨天归零今日项（修复"非当天数据"）
      update(stats);
      stats = rollStats(stats); // 把最新值同步进 daily 当天项
      await chrome.storage.local.set({ [STATS_KEY]: stats });
    } catch {
      /* 统计写入失败不影响核心拦截 */
    }
  }

  const flush = () => {
    if (accCalls === 0) return;
    const bytes = accBytes;
    const calls = accCalls;
    accBytes = 0;
    accCalls = 0;
    void persistStats((stats) => {
      stats.todayP2pCalls += calls;
      stats.totalP2pCalls += calls;
      stats.todayP2pBytes += bytes;
      stats.totalP2pBytes += bytes;
      stats.lastP2pBlock = Date.now(); // 记录最近一次成功拦截，供 UI 展示（可验证性）
    });
  };

  proto.send = function (
    this: RTCDataChannel,
    data: string | Blob | ArrayBuffer | ArrayBufferView,
  ) {
    if (!block) {
      // 用户关闭了阻止：原样透传
      return origSend.call(this, data as never);
    }
    let n = 0;
    if (typeof data === 'string') n = new Blob([data]).size;
    else if (data instanceof Blob) n = data.size;
    else if (data instanceof ArrayBuffer) n = data.byteLength;
    else if (ArrayBuffer.isView(data)) n = data.byteLength;
    accBytes += n;
    accCalls += 1;
    if (timer === undefined) {
      timer = window.setTimeout(() => {
        timer = undefined;
        flush();
      }, 5000);
    }
  } as typeof proto.send;
}
