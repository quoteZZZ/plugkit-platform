// MAIN world 桥接：把页面主世界的视频元信息推给 isolated world 的各个功能模块。
//
// 为什么必须存在：扩展的 content script 默认跑在 isolated world，与页面脚本的 JS 全局
// 对象相互隔离——`window.__INITIAL_STATE__` 在 content script 里恒为 undefined。
// 旧代码直接读它，导致下载（cid/标题）、UP 属地、精确统计三条功能实际上全部拿不到数据。
// 这里以 MAIN world 运行（可读页面变量），用 postMessage 把精简后的元信息送出去。
//
// 约束：MAIN world 里没有 chrome.* API，本文件不得 import 任何扩展侧模块。
import { defineContentScript } from 'wxt/utils/define-content-script';

const MSG_TAG = '__plugkitBiliMeta';
/** SPA 软导航不会重新注入脚本，靠轮询发现 bvid 变化；500ms 读一个小对象开销可忽略 */
const POLL_MS = 500;

interface PushedMeta {
  bvid?: string;
  cid?: number;
  title?: string;
  pic?: string;
  ownerLocation?: string;
  stat?: Record<string, number>;
}

export default defineContentScript({
  matches: ['*://*.bilibili.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    let lastSig = '';

    const read = (): PushedMeta | null => {
      const w = window as unknown as Record<string, any>;
      const state = w.__INITIAL_STATE__ ?? w.__NEXT_DATA__;
      const vd = state?.videoData;
      if (!vd?.bvid && !vd?.cid) return null;
      return {
        bvid: vd.bvid,
        cid: vd.cid,
        title: vd.title,
        pic: vd.pic,
        ownerLocation: vd.owner?.location,
        stat: vd.stat,
      };
    };

    const push = (): void => {
      const data = read();
      if (!data) return;
      const sig = JSON.stringify(data);
      if (sig === lastSig) return; // 去重：内容没变不重复发送
      lastSig = sig;
      window.postMessage({ [MSG_TAG]: true, data }, '*');
    };

    push();
    setInterval(push, POLL_MS);
  },
});
