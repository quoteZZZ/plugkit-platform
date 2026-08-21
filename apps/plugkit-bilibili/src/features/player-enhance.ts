// feature: 播放增强——自定义倍速 / 自动宽屏 / 记忆进度 / 自动播放
// 原则：只在"新视频元素出现"时应用一次，不做持续覆盖——用户手动调整不被干扰。
import { BiliSettings } from '../shared/types';
import { settingsStore, waitFor } from './util';

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

/** 分辨率标签：videoHeight → 常用清晰度文案 */
function qualityLabel(h: number): string {
  if (h >= 2160) return '4K';
  if (h >= 1440) return '2K';
  if (h >= 1080) return '1080P';
  if (h >= 720) return '720P';
  if (h >= 480) return '480P';
  return `${h}P`;
}

/** 播放页右下角悬浮清晰度徽标（低打扰，仅在有视频尺寸时显示） */
function startVideoInfo(video: HTMLVideoElement): void {
  const badge = document.createElement('span');
  badge.id = 'plugkit-video-info';
  badge.style.cssText =
    'position:fixed;right:12px;bottom:12px;z-index:99999;padding:2px 9px;border-radius:6px;' +
    'background:rgba(0,0,0,.55);color:#fff;font-size:12px;pointer-events:none;display:none;font-family:system-ui,sans-serif;';
  document.body.appendChild(badge);

  const update = () => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      badge.style.display = 'none';
      return;
    }
    badge.textContent = `${qualityLabel(h)} ${w}×${h}`;
    badge.style.display = 'block';
  };
  video.addEventListener('resize', update);
  video.addEventListener('loadedmetadata', update);
  // SPA 切视频时 src 变化也刷新
  video.addEventListener('durationchange', update);
  update();
}

export function startPlayerEnhance(s: BiliSettings): void {
  // 当前生效倍速（随设置实时更新，供 SPA 复用/新视频应用）
  let currentSpeed = s.customSpeed;

  // 对页面当前所有 video 应用倍速（倍速=1 视为不干预，跳过）
  const applySpeedToAll = (spd: number) => {
    if (spd <= 0 || spd === 1) return;
    for (const v of document.querySelectorAll<HTMLVideoElement>('video')) {
      void applySpeed(v, spd);
    }
  };

  void (async () => {
    const video = await waitFor<HTMLVideoElement>('video', 10_000);
    if (!video) return;
    if (currentSpeed > 0 && currentSpeed !== 1) await applySpeed(video, currentSpeed);
    if (s.autoWidescreen) await applyWidescreen();
    if (s.rememberProgress) await applyRemember(video);
    if (s.autoPlay) await applyAutoPlay(video);
    if (s.showVideoInfo) startVideoInfo(video);
  })();

  // SPA 内切换视频时，video 元素被复用，但 src 变化：监听 loadedmetadata 重新应用
  document.addEventListener(
    'loadedmetadata',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLVideoElement && currentSpeed !== 1) void applySpeed(t, currentSpeed);
    },
    true,
  );

  // 倍速在 options 改动后实时生效（含已打开页面），无需刷新
  settingsStore.watch((ns) => {
    if (ns.customSpeed !== currentSpeed) {
      currentSpeed = ns.customSpeed;
      applySpeedToAll(ns.customSpeed);
    }
  });
}
