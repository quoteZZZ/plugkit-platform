// feature: 页面广告净化——移除 B 站页面中的广告/推广元素
// 策略：MutationObserver 增量检查新增节点（选择器命中 + 文本关键词双重判断），
// 另加低频选择器兜底扫描（SPA 切换页面）。误删防护：不碰播放器区域/视频。
import { adBlockedChannel } from '../shared/types';
import { elText } from './util';

/** 已知广告/推广元素选择器（B 站改版可能失效，靠关键词兜底） */
const AD_SELECTORS = [
  '.bili-banner', // 首页顶部横幅
  '.ad-report',
  '[class*="advert"]',
  '[class*="ad-banner"]',
  '[class*="ad-card"]',
];

/** 强关键词：命中即视为广告（仅匹配短文本小元素，避免误删正文） */
const AD_PATTERNS = [/^广告/, /^推广/, /^赞助/, /^精选/];

let pending = 0;

function flush() {
  if (pending === 0) return;
  const count = pending;
  pending = 0;
  void adBlockedChannel.send({ count });
}

function remove(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.closest('.bpx-player-container')) return false; // 播放器区域不碰
  if (el.tagName === 'VIDEO' || el.tagName === 'IFRAME') return false;
  el.remove();
  pending += 1;
  if (pending >= 30) flush();
  return true;
}

function matchesSelector(el: Element): boolean {
  return AD_SELECTORS.some((sel) => el.matches(sel));
}

function matchesKeyword(el: Element): boolean {
  const text = elText(el).trim();
  if (text.length === 0 || text.length > 60) return false; // 只处理短文本小元素
  return AD_PATTERNS.some((re) => re.test(text));
}

function checkNode(el: Element): void {
  if (matchesSelector(el)) {
    remove(el);
    return;
  }
  // 文本关键词判断只针对小卡片（div/a/span），避免误伤容器
  if ((el.tagName === 'DIV' || el.tagName === 'A' || el.tagName === 'SPAN') && matchesKeyword(el)) {
    remove(el);
  }
}

export function startAdClean(): void {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        checkNode(node);
        // 新增容器内的子元素也可能含广告
        const children = node.querySelectorAll('div, a, span');
        for (const child of children) checkNode(child);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 低频选择器兜底（SPA 切换页面时全量重扫选择器，开销小）
  setInterval(() => {
    for (const sel of AD_SELECTORS) {
      for (const el of document.querySelectorAll(sel)) remove(el);
    }
  }, 10_000);

  // 每 20 秒上报一次计数
  setInterval(() => flush(), 20_000);
}
