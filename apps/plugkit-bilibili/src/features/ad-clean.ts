// feature: 页面广告净化——移除 B 站页面中的广告/推广元素
// 策略：MutationObserver 增量检查新增节点（选择器命中 + 文本关键词双重判断），
// 另加低频选择器兜底扫描（SPA 切换页面）。误删防护：不碰播放器区域/视频。
// 统计：只往 stats-bus 缓冲累加，落库交给唯一写者（flushStats）。
import { bumpDelta, flushStats } from './stats-bus';
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

function flush(): void {
  if (pending === 0) return;
  const count = pending;
  pending = 0;
  bumpDelta({ adRemoved: count });
  void flushStats();
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

/**
 * 向上最多 3 层找广告容器。
 * 之所以要看祖先：广告卡片通常是容器先插入、内部文字后填充，命中时新增的只是子节点。
 * 限制 3 层是为了避免 closest 一路兜到页面级大容器、误删整块内容。
 */
function closestAd(el: Element): Element | null {
  let cur: Element | null = el;
  for (let depth = 0; cur && depth < 3; depth += 1) {
    if (AD_SELECTORS.some((sel) => cur!.matches(sel))) return cur;
    cur = cur.parentElement;
  }
  return null;
}

function matchesKeyword(el: Element): boolean {
  const text = elText(el).trim();
  if (text.length === 0 || text.length > 60) return false; // 只处理短文本小元素
  return AD_PATTERNS.some((re) => re.test(text));
}

function checkNode(el: Element): void {
  const holder = closestAd(el);
  if (holder) {
    remove(holder);
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
        if (node instanceof Element) checkNode(node);
        // 后代节点无需在此递归查询：subtree 观察器会为每个后代单独派发 addedNodes。
        // 旧实现在这里对每个新增节点再跑一次 querySelectorAll('div,a,span')，
        // 首页一次性插入上百节点时是 O(n²) 的同步 DOM 查询，会明显拖慢首屏。
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

  // 每 20 秒上报一次计数（合并进 stats-bus，由统一写者落库）
  setInterval(flush, 20_000);
  window.addEventListener('pagehide', flush);
}
