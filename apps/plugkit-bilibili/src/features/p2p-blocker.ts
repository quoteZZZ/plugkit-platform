// feature: 直播 P2P(WebRTC DataChannel) 上传阻止
// 由 content.ts(document_start) 加载——必须尽早 hook，故保持独立、精小（不引 React）
import { createStorage } from '@plugkit/core';
import { BiliSettings, DEFAULT_SETTINGS, p2pBlockedChannel } from '../shared/types';

export function startP2pBlocker(): void {
  const settingsStore = createStorage<BiliSettings>('bili:settings', DEFAULT_SETTINGS);
  const proto = window.RTCDataChannel?.prototype;
  if (!proto || typeof proto.send !== 'function') return;

  // 开关状态：storage 为准；document_start 异步读取前的兜底默认开
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
    void p2pBlockedChannel.send({ bytes, calls });
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
