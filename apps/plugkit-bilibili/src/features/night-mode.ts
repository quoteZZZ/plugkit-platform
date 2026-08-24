// feature: 夜间模式——为 B站整站注入暗色主题，并支持快捷键切换
// 实现方式：覆盖 B站官方 CSS 变量（--bg1/--bg2/--text1/--line_regular 等），
// 同时给 <html> 加 bili_dark 类触发 B站原生暗色体系；两者叠加实现"全站变暗"，
// 而非旧版只对少数容器打补丁。
import { matchHotkey } from '@plugkit/core';
import { BiliSettings } from '../shared/types';
import { settingsStore } from './util';

const DARK_CSS = `
/* B站官方暗色变量覆盖：所有引用这些变量的元素自动变暗 */
html.plugkit-night {
  color-scheme: dark;
  --bg1: #121417 !important;
  --bg1_float: #1a1d21 !important;
  --bg2: #171a1e !important;
  --bg2_float: #1f2329 !important;
  --bg3: #23272e !important;
  --bg3_float: #2a2f37 !important;
  --brand_blue: #3d7eff !important;
  --brand_blue_thin: #3d7eff !important;
  --brand_pink: #fb7299 !important;
  --brand_pink_thin: #fb7299 !important;
  --text1: #d4d8dd !important;
  --text2: #aab1ba !important;
  --text3: #7d848d !important;
  --text4: #5c636b !important;
  --text5: #4a5159 !important;
  --text_link: #6ea8fe !important;
  --line_light: #23272e !important;
  --line_regular: #2e333a !important;
  --line_bold: #3a4048 !important;
  --graph_bg_thin: #1f2329 !important;
  --graph_bg_regular: #23272e !important;
  --graph_bg_thick: #2a2f37 !important;
  --Graph_bg_thin: #1f2329 !important;
  --Graph_bg_regular: #23272e !important;
  --Graph_bg_thick: #2a2f37 !important;
  --shadow_1: 0 2px 8px rgba(0,0,0,.4) !important;
  --shadow_2: 0 4px 16px rgba(0,0,0,.45) !important;
}
html.plugkit-night body,
html.plugkit-night #app,
html.plugkit-night .bili-feed,
html.plugkit-night .vui-popover,
html.plugkit-night .bili-dyn-item {
  background: #121417 !important;
  color: var(--text1) !important;
}
html.plugkit-night .bili-header,
html.plugkit-night .bili-header__bar {
  background: #16191d !important;
}
/* 视频信息区/评论/卡片兜底：变量覆盖未覆盖到的背景层 */
html.plugkit-night .video-info-container,
html.plugkit-night .video-desc-container,
html.plugkit-night .comment,
html.plugkit-night .bili-comment,
html.plugkit-night .bili-video-card,
html.plugkit-night .bili-live-card,
html.plugkit-night .right-container,
html.plugkit-night .left-container {
  background: #171a1e !important;
  color: #d4d8dd !important;
}
html.plugkit-night a { color: #6ea8fe !important; }
html.plugkit-night input,
html.plugkit-night textarea,
html.plugkit-night select {
  background: #1b1e25 !important;
  color: #d4d8dd !important;
  border-color: #2e333a !important;
}
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
    // 触发 B站官方暗色体系（若页面支持）；不支持的页面靠上方变量覆盖兜底
    document.documentElement.classList.add('bili_dark');
  } else {
    document.documentElement.classList.remove('plugkit-night', 'bili_dark');
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
