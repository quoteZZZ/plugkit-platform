// 平台归一层：对外只暴露统一的 browser API 与少量业务辅助
// 浏览器差异一律封死在这里，业务代码不要直接 import chrome.*
import { browser } from 'wxt/browser';

export { browser };

// 与浏览器原生 Tab 兼容的最小结构（避免依赖 wxt/browser 的推断细节）
export type Tab = {
  id?: number;
  title?: string;
  url?: string;
};

/** 获取当前激活标签页（插件里操作标签页的标准写法） */
export async function getActiveTab(): Promise<Tab | undefined> {
  const tabs = (await browser.tabs.query({
    active: true,
    currentWindow: true,
  })) as unknown as Tab[];
  return tabs[0];
}
