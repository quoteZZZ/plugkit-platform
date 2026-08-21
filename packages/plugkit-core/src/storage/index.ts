// 强类型 storage 封装：统一命名空间 + 默认值 + 变更订阅
// 内部使用 chrome.storage.local（跨浏览器由 wxt/browser 归一）
import { browser } from 'wxt/browser';

export interface StorageApi<T extends Record<string, unknown>> {
  get(): Promise<T>;
  set(patch: Partial<T>): Promise<void>;
  watch(cb: (value: T) => void): () => void;
  readonly defaults: T;
}

/**
 * 创建一个带命名空间的强类型存储。
 * const s = createStorage('demo', { value: '' });
 * await s.set({ value: 'x' });
 * const v = await s.get();
 */
export function createStorage<T extends Record<string, unknown>>(
  namespace: string,
  defaults: T,
): StorageApi<T> {
  const key = `plugkit:${namespace}`;

  async function get(): Promise<T> {
    const res = await browser.storage.local.get(key);
    const stored = (res[key] as Partial<T>) ?? {};
    return { ...defaults, ...stored };
  }

  async function set(patch: Partial<T>): Promise<void> {
    const current = await get();
    const next = { ...current, ...patch };
    await browser.storage.local.set({ [key]: next });
  }

  function watch(cb: (value: T) => void): () => void {
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes[key]) {
        cb({ ...defaults, ...(changes[key].newValue as Partial<T>) });
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }

  return { get, set, watch, defaults };
}
