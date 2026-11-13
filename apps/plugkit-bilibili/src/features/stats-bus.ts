// 统计总线：各功能只往 window 上的缓冲里累加，由单一写者合并落库。
//
// 为什么需要它：content.ts(document_start) 与 ui.content.ts(document_idle) 是两个独立
// content script，各自 bundle 内有一份模块状态，但 chrome.storage.local 是全局共享的。
// 旧实现里 ad-clean 与 p2p-blocker 都做「读取-累加-写回」，两者并发 flush 时会互相覆盖，
// 计数凭空丢失（表现为统计偏小、清零后又莫名回涨）。
// 同一扩展的所有 content script 共享同一个 isolated world（同一个 window），
// 因此把增量放在 window 上，并只让 idr 侧定时器执行写入，即可彻底消除读改写竞态。
import { createLogger } from '@plugkit/core';
import { BiliStats, DEFAULT_STATS, rollStats } from '../shared/types';

export const STATS_KEY = 'plugkit:bili:stats';

const BUS_KEY = '__plugkitBiliStats';
const GATE_KEY = '__plugkitBiliFlushGate';

export interface StatsDelta {
  pcdn: number;
  p2pBytes: number;
  p2pCalls: number;
  adRemoved: number;
}

interface Bus {
  delta: StatsDelta;
  /** 最近一次成功阻止 P2P 上传的时间戳；null 表示本轮没有 */
  lastP2pBlock: number | null;
}

const logger = createLogger('bili-stats', 'warn');

function emptyDelta(): StatsDelta {
  return { pcdn: 0, p2pBytes: 0, p2pCalls: 0, adRemoved: 0 };
}

function bus(): Bus {
  const w = window as unknown as Record<string, Bus | undefined>;
  let b = w[BUS_KEY];
  if (!b) {
    b = { delta: emptyDelta(), lastP2pBlock: null };
    w[BUS_KEY] = b;
  }
  return b;
}

/** 累加计数。任意 content script 可调用，不触发落库。 */
export function bumpDelta(patch: Partial<StatsDelta>, p2pBlockAt?: number): void {
  const b = bus();
  const d = b.delta;
  if (patch.pcdn) d.pcdn += patch.pcdn;
  if (patch.p2pBytes) d.p2pBytes += patch.p2pBytes;
  if (patch.p2pCalls) d.p2pCalls += patch.p2pCalls;
  if (patch.adRemoved) d.adRemoved += patch.adRemoved;
  if (p2pBlockAt) b.lastP2pBlock = p2pBlockAt;
}

/** 取走当前增量并清零。 */
function drain(): { delta: StatsDelta; lastP2pBlock: number | null } {
  const b = bus();
  const snap = { delta: { ...b.delta }, lastP2pBlock: b.lastP2pBlock };
  b.delta = emptyDelta();
  b.lastP2pBlock = null;
  return snap;
}

/** 落库失败时把增量还回去，下次 flush 重试（宁可重复一次也不丢计数）。 */
function restore(snap: { delta: StatsDelta; lastP2pBlock: number | null }): void {
  const b = bus();
  b.delta.pcdn += snap.delta.pcdn;
  b.delta.p2pBytes += snap.delta.p2pBytes;
  b.delta.p2pCalls += snap.delta.p2pCalls;
  b.delta.adRemoved += snap.delta.adRemoved;
  if (snap.lastP2pBlock) b.lastP2pBlock = snap.lastP2pBlock;
}

/**
 * 合并写入 stats。全页唯一写者（idle 侧定时器 + pagehide 兜底），
 * 重入用 window 上的闸门挡住，避免两个 bundle 同时进入。
 */
export async function flushStats(): Promise<void> {
  const w = window as unknown as Record<string, boolean | undefined>;
  if (w[GATE_KEY]) return;
  const snap = drain();
  const total =
    snap.delta.pcdn + snap.delta.p2pBytes + snap.delta.p2pCalls + snap.delta.adRemoved;
  if (total === 0 && snap.lastP2pBlock === null) return;

  w[GATE_KEY] = true;
  try {
    const raw = await chrome.storage.local.get(STATS_KEY);
    let stats = rollStats({ ...DEFAULT_STATS, ...(raw[STATS_KEY] ?? {}) } as BiliStats);
    stats.todayPcdn += snap.delta.pcdn;
    stats.totalPcdn += snap.delta.pcdn;
    stats.todayP2pCalls += snap.delta.p2pCalls;
    stats.totalP2pCalls += snap.delta.p2pCalls;
    stats.todayP2pBytes += snap.delta.p2pBytes;
    stats.totalP2pBytes += snap.delta.p2pBytes;
    stats.todayAdRemoved += snap.delta.adRemoved;
    stats.totalAdRemoved += snap.delta.adRemoved;
    if (snap.lastP2pBlock) stats.lastP2pBlock = snap.lastP2pBlock;
    await chrome.storage.local.set({ [STATS_KEY]: rollStats(stats) });
  } catch (e) {
    restore(snap);
    logger.warn('统计落库失败，已回填待重试', e);
  } finally {
    w[GATE_KEY] = false;
  }
}

/** 启动定时落库；返回停止函数。pagehide 时兜底刷一次（SPA 站内跳转不触发，仅关页面生效）。 */
export function startStatsFlusher(intervalMs = 5000): () => void {
  const timer = window.setInterval(() => void flushStats(), intervalMs);
  const onHide = () => void flushStats();
  window.addEventListener('pagehide', onHide);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('pagehide', onHide);
  };
}
