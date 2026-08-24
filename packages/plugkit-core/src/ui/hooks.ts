import React from 'react';
import { browser } from 'wxt/browser';
import { matchHotkey } from '../hotkey';

/**
 * 响应式读取/写入一个 chrome.storage.local 原始键。
 * 兼容 B站插件"直接读写 plugkit:bili:settings"的模式；
 * 任意端修改该键都会通过 storage.onChanged 同步到这里。
 */
export function useChromeStorage<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): [T, (patch: Partial<T>) => Promise<void>, boolean] {
  const [value, setValue] = React.useState<T>(defaults);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    void browser.storage.local.get(key).then((res) => {
      if (!alive) return;
      setValue({ ...defaults, ...((res[key] as Partial<T>) ?? {}) });
      setLoading(false);
    });
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && changes[key]) {
        setValue({ ...defaults, ...(changes[key].newValue as Partial<T>) });
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, [key]);

  const update = React.useCallback(
    async (patch: Partial<T>) => {
      const current = await browser.storage.local.get(key);
      const merged = {
        ...defaults,
        ...((current[key] as Partial<T>) ?? {}),
        ...patch,
      };
      await browser.storage.local.set({ [key]: merged });
    },
    [key],
  );

  return [value, update, loading];
}

/** 全局热键：匹配组合键时触发 handler（输入框聚焦时不触发，避免冲突） */
export function useHotkey(
  combo: string | null | undefined,
  handler: (e: KeyboardEvent) => void,
): void {
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;
  React.useEffect(() => {
    if (!combo) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      ) {
        return;
      }
      if (matchHotkey(e, combo)) {
        e.preventDefault();
        handlerRef.current(e);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [combo]);
}
