// Content Script：注入到网页，能操作 DOM 但与原页面 JS 隔离
// 用 defineContentScript 包裹，并声明注入范围 matches
import { defineContentScript } from 'wxt/utils/define-content-script';
import { defineChannel, createLogger } from '@plugkit/core';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const logger = createLogger('content');
    logger.info('Content Script 已注入');

    // 供 popup 通过 tabId 向本页取标题，演示 popup → content 的定向消息
    const getTitle = defineChannel<void, string>('GET_TITLE');
    getTitle.on(() => document.title);
  },
});
