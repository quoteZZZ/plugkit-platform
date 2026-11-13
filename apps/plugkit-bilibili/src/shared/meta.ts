// 视频元信息（isolated world 侧）。
// 数据由 page-bridge.content.ts 在 MAIN world 读取后 postMessage 过来——content script
// 读不到页面主世界的 window.__INITIAL_STATE__，直接读会恒为 undefined。
export interface BiliVideoMeta {
  bvid?: string;
  cid?: number;
  title?: string;
  pic?: string;
  stat?: Record<string, number>;
}

const MSG_TAG = '__plugkitBiliMeta';

let cached: BiliVideoMeta | null = null;
let waiters: (() => void)[] = [];

/** 开始接收桥接数据；每个页面只需调用一次 */
export function listenMeta(): void {
  if ((window as unknown as Record<string, unknown>).__plugkitMetaListening) return;
  (window as unknown as Record<string, unknown>).__plugkitMetaListening = true;

  window.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as Record<string, unknown> | null;
    if (!d || d[MSG_TAG] !== true) return;
    cached = (d.data as BiliVideoMeta) ?? null;
    const list = waiters;
    waiters = [];
    for (const fn of list) fn();
  });
}

export function getCachedMeta(): BiliVideoMeta | null {
  return cached;
}

/** 当前 URL 上的 bvid */
export function urlBvid(): string | null {
  return location.pathname.match(/\/video\/(BV\w+)/)?.[1] ?? null;
}

/** 等首帧数据；超时返回已缓存的值（可能仍是 null） */
export async function getVideoMeta(timeoutMs = 3000): Promise<BiliVideoMeta | null> {
  if (cached) return cached;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cached), timeoutMs);
    waiters.push(() => {
      clearTimeout(timer);
      resolve(cached);
    });
  });
}

/**
 * 取「当前正在看的这个视频」的元信息。
 * SPA 换视频后桥接数据可能还停留在上一个视频，bvid 不匹配时返回 null，
 * 由调用方决定回源还是提示——宁可不动作，也不能拿错视频的 cid 去下载。
 */
export async function getMetaForCurrentVideo(
  timeoutMs = 3000,
): Promise<BiliVideoMeta | null> {
  const bv = urlBvid();
  const m = await getVideoMeta(timeoutMs);
  if (!m) return null;
  if (bv && m.bvid && m.bvid !== bv) return null;
  return m;
}
