// feature: 播放增强——自定义倍速 / 自动宽屏 / 记忆进度 / 自动播放
// 原则：只在"新视频元素出现"时应用一次，不做持续覆盖——用户手动调整不被干扰。
import { BiliSettings } from '../shared/types';
import { waitFor } from './util';

const PROGRESS_KEY = 'plugkit:bili-progress';

function getBvid(): string | null {
  const m = location.pathname.match(/^\/video\/(BV\w+)/);
  return m ? m[1] : null;
}

async function applySpeed(video: HTMLVideoElement, speed: number): Promise<void> {
  try {
    video.playbackRate = speed;
  } catch {
    /* 个别值可能被浏览器拒绝，忽略 */
  }
}

async function applyWidescreen(): Promise<void> {
  // B 站播放器宽屏按钮（新旧两版 class 都试）
  const btn = await waitFor<HTMLButtonElement>(
    '.bpx-player-ctrl-wide, .bpx-player-ctrl-btn-wide, .wide-screen',
    6000,
  );
  if (btn && !btn.classList.contains('active')) btn.click();
}

async function applyRemember(video: HTMLVideoElement): Promise<void> {
  const bvid = getBvid();
  if (!bvid) return;
  const raw = await chrome.storage.local.get(PROGRESS_KEY);
  const map = (raw[PROGRESS_KEY] as Record<string, number>) ?? {};
  const saved = map[bvid];
  if (typeof saved !== 'number' || saved < 30) return;
  video.addEventListener(
    'loadedmetadata',
    () => {
      if (Number.isFinite(video.duration) && saved < video.duration - 60) {
        video.currentTime = saved;
      }
    },
    { once: true },
  );
  // 节流写入：每 5 秒记一次
  let last = 0;
  video.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - last < 5000) return;
    last = now;
    if (video.currentTime < 10 || video.currentTime > (video.duration ?? 0) - 10) return;
    void chrome.storage.local.set({
      [PROGRESS_KEY]: { ...map, [bvid]: Math.floor(video.currentTime) },
    });
  });
}

async function applyAutoPlay(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch {
    /* 浏览器自动播放策略拦截时静默忽略 */
  }
}

export function startPlayerEnhance(s: BiliSettings): void {
  void (async () => {
    const video = await waitFor<HTMLVideoElement>('video', 10_000);
    if (!video) return;
    if (s.customSpeed > 0 && s.customSpeed !== 1) await applySpeed(video, s.customSpeed);
    if (s.autoWidescreen) await applyWidescreen();
    if (s.rememberProgress) await applyRemember(video);
    if (s.autoPlay) await applyAutoPlay(video);
  })();

  // SPA 内切换视频时，video 元素被复用，但 src 变化：监听 loadedmetadata 重新应用
  if (s.customSpeed > 0 && s.customSpeed !== 1) {
    document.addEventListener(
      'loadedmetadata',
      (e) => {
        const t = e.target;
        if (t instanceof HTMLVideoElement) void applySpeed(t, s.customSpeed);
      },
      true,
    );
  }
}
