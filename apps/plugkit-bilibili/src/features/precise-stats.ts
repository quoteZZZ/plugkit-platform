// feature: 精确数据展示——把播放页模糊统计（如"1.2万播放"）替换为精确值
// 数据来源：window.__INITIAL_STATE__.videoData.stat（播放/弹幕/点赞/投币/收藏/转发精确数）
// 实现：限定在播放页统计区域（video-info-detail / video-toolbar）内，按关键词匹配文本节点，
//       仅替换数字段，不破坏 DOM 结构；MutationObserver 处理 SPA 切换/数字刷新。
import { BiliSettings } from '../shared/types';
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

function readStat(): Record<string, number> {
  const w = window as unknown as Record<string, any>;
  return w.__INITIAL_STATE__?.videoData?.stat ?? {};
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
  const next = text.replace(FMT, fmtExact(exact));
  if (next === text) return false;
  node.nodeValue = next;
  return true;
}

function applyPrecise(): void {
  const stat = readStat();
  // 非播放页或无数据时不处理
  if (!stat.view && !stat.like && !stat.danmaku) return;
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

export function startPreciseStats(): void {
  applyPrecise();
  // SPA 切换 / 数字刷新（点赞后）时重新应用
  const observer = new MutationObserver(() => applyPrecise());
  observer.observe(document.body, { childList: true, subtree: true });
  // 设置关闭时停止监听
  settingsStore.watch((s: BiliSettings) => {
    if (!s.preciseStats) observer.disconnect();
  });
}
