// 统计用 PCDN 域名模式。
// 注意：拦截真源是 public/rules_*.json（浏览器内核 DNR 执行），
// 本文件仅用于 webRequest 统计计数，必须与规则文件保持同步——改域名时两处一起改。
export const BASE_PATTERNS = ['mcdn.bilivideo.cn', 'szbdyd.com', 'onethingpcs.com'];

export const AGGRESSIVE_PATTERNS = [
  'bilivideo.cn',
  'pcdn.biliapi.net',
  'yfcdn.net',
  'ppio.cloud',
];

/** 判断 URL 是否命中 PCDN 模式（按当前档位） */
export function matchesPcdn(url: string, aggressive: boolean): boolean {
  const patterns = aggressive
    ? [...BASE_PATTERNS, ...AGGRESSIVE_PATTERNS]
    : BASE_PATTERNS;
  return patterns.some((p) => url.includes(p));
}

/** webRequest 监听器过滤的 URL 模式（必须与 wxt.config 的 host_permissions 一致） */
export const WEB_REQUEST_FILTER = {
  urls: [
    '*://*.bilibili.com/*',
    '*://*.bilivideo.cn/*',
    '*://*.bilivideo.com/*',
    '*://*.biliapi.net/*',
    '*://*.szbdyd.com/*',
    '*://*.onethingpcs.com/*',
    '*://*.yfcdn.net/*',
    '*://*.ppio.cloud/*',
  ],
};
