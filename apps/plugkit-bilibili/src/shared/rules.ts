// PCDN 统计模式 —— 单一真源：域名列表见 pcdn-patterns.json。
// 拦截真源是 public/rules_base.json 与 public/rules_aggressive.json（浏览器内核 DNR 执行），
// 二者由 scripts/sync-rules.mjs 从同一份 pcdn-patterns.json 自动生成。
// 以后改域名只需改 pcdn-patterns.json 一处，再跑 `pnpm sync-rules`。
import pcdnPatterns from './pcdn-patterns.json';

/** 基础档：明确以 P2P/PCDN 为主业的域名 */
export const BASE_PATTERNS = pcdnPatterns.base;

/** 激进档：覆盖全部视频分发/加速域名（含可能误伤 CDN 的域名） */
export const AGGRESSIVE_PATTERNS = pcdnPatterns.aggressive;

/** 全部拦截域名（激进档用） */
export const ALL_PATTERNS = [...BASE_PATTERNS, ...AGGRESSIVE_PATTERNS];

/** 额外需要 webRequest 观察、但不在拦截列表中的域（视频分发主域等） */
export const EXTRA_FILTER_DOMAINS = ['bilibili.com', 'bilivideo.com', 'biliapi.net'];

/** 判断 URL 是否命中 PCDN 模式（按当前档位） */
export function matchesPcdn(url: string, aggressive: boolean): boolean {
  const patterns = aggressive ? ALL_PATTERNS : BASE_PATTERNS;
  return patterns.some((p) => url.includes(p));
}

/** webRequest 监听器过滤的 URL 模式（由域名真源生成；需与 wxt.config 的 host_permissions 保持一致） */
export const WEB_REQUEST_FILTER = {
  urls: (() => {
    const candidates = [...new Set([...ALL_PATTERNS, ...EXTRA_FILTER_DOMAINS])];
    // 去掉已被更宽泛域覆盖的子域（如 mcdn.bilivideo.cn ⊂ bilivideo.cn），保持 filter 精简
    const tops = candidates.filter(
      (d) => !candidates.some((o) => o !== d && d.endsWith(`.${o}`)),
    );
    return tops.map((d) => `*://*.${d}/*`);
  })(),
};
