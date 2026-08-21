// features 公共工具：选择器等待、DOM 查询、设置读取
import { createStorage } from '@plugkit/core';
import { BiliSettings, DEFAULT_SETTINGS } from '../shared/types';

export const settingsStore = createStorage<BiliSettings>('bili:settings', DEFAULT_SETTINGS);

/** 等待某个选择器出现（轮询，超时返回 null） */
export async function waitFor<T extends Element = Element>(
  selector: string,
  timeout = 8000,
): Promise<T | null> {
  const existing = document.querySelector<T>(selector);
  if (existing) return existing;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** 查询所有匹配元素 */
export function qsa<T extends Element = Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

/** 元素文本（含子节点） */
export function elText(el: Element): string {
  return (el.textContent ?? '').toLowerCase();
}
