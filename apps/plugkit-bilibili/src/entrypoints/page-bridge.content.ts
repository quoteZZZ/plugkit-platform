// MAIN world 页面桥（单向：上行）。
//
// 为什么需要它：扩展的 content script 跑在 isolated world，与页面脚本的 JS 全局对象隔离，
// `window.__INITIAL_STATE__` 在 content script 里恒为 undefined。
// 旧代码直接读它，导致下载（cid/标题）、UP 属地、精确统计三条功能长期拿不到数据。
//
// 约束：MAIN world 没有 chrome.* API，本文件不得 import 任何扩展侧模块。
import { defineContentScript } from 'wxt/utils/define-content-script';

const META_TAG = '__plugkitBiliMeta';

/** 稳态轮询间隔：SPA 换视频时靠它发现变化 */
const POLL_MS = 500;
/** 启动阶段快速探测：页面脚本执行后 __INITIAL_STATE__ 才出现，前 2 秒用高频才能赶上首屏 */
const FAST_POLL_MS = 100;
const FAST_TICKS = 20;

export default defineContentScript({
  matches: ['*://*.bilibili.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    let lastSig = '';

    const read = (): Record<string, unknown> | null => {
      const w = window as unknown as Record<string, any>;
      const state = w.__INITIAL_STATE__ ?? w.__NEXT_DATA__;
      const vd = state?.videoData;
      if (!vd?.bvid && !vd?.cid) return null;
      return {
        bvid: vd.bvid,
        cid: vd.cid,
        title: vd.title,
        pic: vd.pic,
        stat: vd.stat,
      };
    };

    const push = (): void => {
      const data = read();
      if (!data) return;
      const sig = JSON.stringify(data);
      if (sig === lastSig) return; // 内容未变不重复发送
      lastSig = sig;
      window.postMessage({ [META_TAG]: true, data }, '*');
    };

    // 启动阶段高频探测（首屏数据一出现就能推），之后回到稳态低频
    let ticks = 0;
    const tick = (): void => {
      push();
      ticks += 1;
      setTimeout(tick, ticks < FAST_TICKS ? FAST_POLL_MS : POLL_MS);
    };
    tick();
  },
});
