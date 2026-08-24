// feature: 夜间模式——为 B站页面注入暗色主题，并支持快捷键切换
// 通过覆盖 B站 CSS 变量与少量关键背景实现；即便变量名随改版变化也只"暗得不全"，不会破坏页面。
import { matchHotkey } from '@plugkit/core';
import { BiliSettings } from '../shared/types';
import { settingsStore } from './util';

const DARK_CSS = `
html.plugkit-night, html.plugkit-night body { background: #0f1114 !important; color: #d0d3d8 !important; }
html.plugkit-night .bili-header,
html.plugkit-night .footer,
html.plugkit-night .video-info-container,
html.plugkit-night .video-desc-container,
html.plugkit-night .comment,
html.plugkit-night .bili-comment,
html.plugkit-night .bili-video-card,
html.plugkit-night .bili-live-card,
html.plugkit-night .right-container,
html.plugkit-night .left-container { background: #16181d !important; }
html.plugkit-night a { color: #6ea8fe !important; }
html.plugkit-night input, html.plugkit-night textarea { background: #1b1e25 !important; color: #d0d3d8 !important; border-color: #2a2e37 !important; }
html.plugkit-night img, html.plugkit-night video { filter: brightness(0.92); }
`;

let styleEl: HTMLStyleElement | null = null;

function apply(on: boolean): void {
  if (on) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'plugkit-night-style';
      styleEl.textContent = DARK_CSS;
      document.head.appendChild(styleEl);
    }
    document.documentElement.classList.add('plugkit-night');
  } else {
    document.documentElement.classList.remove('plugkit-night');
  }
}

/**
 * 常驻注册（无论开关是否开启），使快捷键可"反向打开"夜间模式；
 * 初始是否应用以设置中的 nightMode 为准。
 */
export function startNightMode(s: BiliSettings): void {
  apply(s.nightMode);

  // 设置变化时实时跟随
  settingsStore.watch((cur) => apply(cur.nightMode));

  // 全局快捷键：忽略输入框聚焦场景，避免与表单冲突
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    void settingsStore.get().then((cur) => {
      if (cur.nightModeHotkey && matchHotkey(e, cur.nightModeHotkey)) {
        e.preventDefault();
        const next = !document.documentElement.classList.contains('plugkit-night');
        apply(next);
        void settingsStore.set({ nightMode: next });
      }
    });
  };
  document.addEventListener('keydown', onKey);
}
