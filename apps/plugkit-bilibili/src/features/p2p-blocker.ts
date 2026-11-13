// feature: 直播 P2P(WebRTC DataChannel) 上传阻止
// 由 content.ts(document_start) 加载——必须尽早 hook，故保持独立、精小（不引 React）
// 统计：只往 stats-bus 的 window 缓冲累加，落库交给唯一写者（flushStats），
//       避免与 ad-clean 并发「读-改-写」chrome.storage 时互相覆盖丢计数。
import { createStorage } from '@plugkit/core';
import { BiliSettings, DEFAULT_SETTINGS } from '../shared/types';
import { bumpDelta, flushStats } from './stats-bus';

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

  const flush = () => {
    if (accCalls === 0) return;
    const bytes = accBytes;
    const calls = accCalls;
    accBytes = 0;
    accCalls = 0;
    // 先入缓冲（同步、不会丢），再触发落库
    bumpDelta({ p2pBytes: bytes, p2pCalls: calls }, Date.now());
    void flushStats();
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

  // 关页面/切走前把残余计数刷掉（直播页常被直接关闭，不刷会丢最后 5 秒的计数）
  window.addEventListener('pagehide', flush);
}
