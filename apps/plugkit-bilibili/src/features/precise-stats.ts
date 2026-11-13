// feature: 精确数据展示——把播放页模糊统计（如"1.2万播放"）替换为精确值
// 数据来源：window.__INITIAL_STATE__.videoData.stat
// 实现：限定在播放页统计区域内按关键词匹配文本节点，仅替换数字段，不破坏 DOM 结构。
//
// 性能要点（旧版为真实卡顿源）：
//  - MutationObserver 回调做了 300ms 合并，否则播放页每次 DOM 变动都会全量 TreeWalker 扫一遍；
//  - 已是目标值的节点直接跳过，避免同一节点被反复替换；
//  - 开关关闭后能重新打开（旧版只 disconnect，再打开设置也无监听）。
import { BiliSettings } from '../shared/types';
import { getCachedMeta } from '../shared/meta';
import { settingsStore } from './util';

const FMT = /[\d,.]+\s*(万|亿)?/;

const RULES: { key: string; get: (s: Record<string, number>) => number | undefined }[] = [
  { key: '播放', get: (s) => s.view },
  { key: '弹幕', get: (s) => s.danmaku },
  { key: '点赞', get: (s) => s.like },
  { key: '投币', get: (s) => s.coin },
  { key: '收藏', get: (s) => s.favorite },
  { key: '转发', get: (s) => s.share },
];

/** 播放页统计区域（新老播放器 class 兼容） */
const AREA_SELECTOR = '.video-info-detail, .video-toolbar, .video-toolbar-left';

/** DOM 变更合并窗口：远大于播放页的变动频率，又能保证点赞后数字及时刷新 */
const THROTTLE_MS = 300;

/** 统计数字来自桥接缓存：content script 读不到页面主世界的 __INITIAL_STATE__ */
function readStat(): Record<string, number> {
  return getCachedMeta()?.stat ?? {};
}

function fmtExact(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** 替换单个文本节点：父元素含统计关键词、文本含数字段时替换 */
function preciseTextNode(node: Text, stat: Record<string, number>): boolean {
  const text = node.nodeValue ?? '';
  if (!FMT.test(text)) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  // 仅处理短文本（统计标签/数字），避免误伤长段落
  const ptext = parent.textContent ?? '';
  if (ptext.length === 0 || ptext.length > 40) return false;
  const rule = RULES.find((r) => ptext.includes(r.key));
  if (!rule) return false;
  const exact = rule.get(stat);
  if (typeof exact !== 'number' || !Number.isFinite(exact) || exact < 0) return false;
  // 已是精确值：不重复改写（点过赞后数字变了会自然不相等，从而重新替换）
  if (text.trim() === fmtExact(exact)) return false;
  const next = text.replace(FMT, fmtExact(exact));
  if (next === text) return false;
  node.nodeValue = next;
  return true;
}

/** 桥接数据到达前有短暂空窗：限次重试，避免首屏漏刷 */
let emptyRetries = 0;

function applyPrecise(): void {
  const stat = readStat();
  // 非播放页或无数据时不处理
  if (!stat.view && !stat.like && !stat.danmaku) {
    if (emptyRetries < 8) {
      emptyRetries += 1;
      schedule();
    }
    return;
  }
  emptyRetries = 0;
  const areas = document.querySelectorAll(AREA_SELECTOR);
  if (areas.length === 0) return;
  for (const area of areas) {
    const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        preciseTextNode(node as Text, stat);
      }
    }
  }
}

let observer: MutationObserver | null = null;
let timer: number | undefined;

function schedule(): void {
  if (timer !== undefined) return;
  timer = window.setTimeout(() => {
    timer = undefined;
    applyPrecise();
  }, THROTTLE_MS);
}

function start(): void {
  if (observer) return;
  applyPrecise();
  observer = new MutationObserver(schedule);
  // SPA 切换 / 数字刷新（点赞后）时重新应用
  observer.observe(document.body, { childList: true, subtree: true });
}

function stop(): void {
  observer?.disconnect();
  observer = null;
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
}

/** 常驻注册：内部按设置启停，使 options 里关闭/打开都能即时生效 */
export function startPreciseStats(s: BiliSettings): void {
  if (s.preciseStats) start();
  settingsStore.watch((cur: BiliSettings) => {
    if (cur.preciseStats) start();
    else stop();
  });
}
