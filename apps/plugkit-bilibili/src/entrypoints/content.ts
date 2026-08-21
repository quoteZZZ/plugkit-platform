// Content Script A：document_start 注入，仅做直播 P2P 上传阻止（必须尽早 hook）
import { defineContentScript } from 'wxt/utils/define-content-script';
import { startP2pBlocker } from '../features/p2p-blocker';

export default defineContentScript({
  matches: ['*://*.bilibili.com/*'],
  runAt: 'document_start',
  main() {
    startP2pBlocker();
  },
});
