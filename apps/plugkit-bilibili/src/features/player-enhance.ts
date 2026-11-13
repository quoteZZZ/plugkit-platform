// feature: 播放增强——固定倍速 / 自动宽屏 / 记忆播放进度
// 原则：只在"新视频元素出现"时应用一次，不做持续覆盖——用户手动调整不被干扰。
import { BiliSettings } from '../shared/types';
import { settingsStore, waitFor } from './util';

const PROGRESS_KEY = 'plugkit:bili-progress';

function getBvid(): string | null {
  const m = location.pathname.match(/^\/video\/(BV\w+)/);
  return m ? m[1] : null;
}

function applySpeed(video: HTMLVideoElement, speed: number): void {
  if (!(speed > 0) || speed === 1) return;
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

export function startPlayerEnhance(s: BiliSettings): void {
  let currentSpeed = s.customSpeed;

  const applySpeedToAll = (spd: number) => {
    for (const v of document.querySelectorAll<HTMLVideoElement>('video')) {
      applySpeed(v, spd);
    }
  };

  void (async () => {
    const video = await waitFor<HTMLVideoElement>('video', 10_000);
    if (!video) return;
    applySpeed(video, currentSpeed);
    if (s.autoWidescreen) await applyWidescreen();
    if (s.rememberProgress) await applyRemember(video);
  })();

  // SPA 内切换视频时 video 元素被复用，src 变化后重新应用
  document.addEventListener(
    'loadedmetadata',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLVideoElement) applySpeed(t, currentSpeed);
    },
    true,
  );

  // 倍速改动实时生效（含已打开页面）
  settingsStore.watch((ns) => {
    if (ns.customSpeed !== currentSpeed) {
      currentSpeed = ns.customSpeed;
      applySpeedToAll(ns.customSpeed);
    }
  });
}
