// feature: 弹幕管理——快捷键一键开关弹幕 + 弹幕透明度调节
// 说明：B 站新版播放器弹幕为 canvas 绘制，透明度通过容器级 CSS 生效（全模式可用）；
// 屏蔽词/字号等需 protobuf 响应级过滤，成本高，本期后置（options 中有说明）。
import { BiliSettings } from '../shared/types';
import { settingsStore } from './util';

const STYLE_ID = 'plugkit-danmaku-style';
const DM_WRAP_SELECTOR = '.bpx-player-dm-wrap, .bpx-player-dm-wrap-container';
// 弹幕开关按钮（新旧播放器 class 兼容）
const DM_TOGGLE_SELECTOR = '.bpx-player-ctrl-danmaku, .bpx-player-ctrl-btn-danmaku';

function applyOpacity(opacity: number): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    (document.head ?? document.documentElement).appendChild(style);
  }
  style.textContent = `${DM_WRAP_SELECTOR} { opacity: ${Math.round(opacity) / 100} !important; }`;
}

async function toggleDanmaku(): Promise<void> {
  // 优先模拟点击播放器弹幕开关按钮
  const btns = Array.from(document.querySelectorAll<HTMLElement>(DM_TOGGLE_SELECTOR));
  if (btns.length > 0) {
    btns[0].click();
    return;
  }
  // 兜底：直接切换弹幕容器显示
  for (const el of document.querySelectorAll<HTMLElement>(DM_WRAP_SELECTOR)) {
    el.style.display = el.style.display === 'none' ? '' : 'none';
  }
}

/** 解析快捷键字符串（如 "Alt+D" / "Ctrl+Shift+B"）→ 修饰键与主键；非法返回 null */
function parseHotkey(spec: string): { alt: boolean; ctrl: boolean; shift: boolean; key: string } | null {
  const parts = spec
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  let alt = false;
  let ctrl = false;
  let shift = false;
  const keys: string[] = [];
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'alt' || l === 'option') alt = true;
    else if (l === 'ctrl' || l === 'control') ctrl = true;
    else if (l === 'shift') shift = true;
    else keys.push(p);
  }
  if (keys.length !== 1) return null;
  return { alt, ctrl, shift, key: keys[0].toLowerCase() };
}

export function startDanmaku(s: BiliSettings): void {
  let currentOpacity = s.danmakuOpacity;
  let hotkey = s.danmakuHotkey;
  applyOpacity(currentOpacity);

  // 一键开关弹幕（快捷键来自设置，可自定义）
  const onKey = (e: KeyboardEvent) => {
    const spec = parseHotkey(hotkey);
    if (!spec) return;
    if (
      e.altKey === spec.alt &&
      e.ctrlKey === spec.ctrl &&
      e.shiftKey === spec.shift &&
      e.key.toLowerCase() === spec.key
    ) {
      e.preventDefault();
      void toggleDanmaku();
    }
  };
  document.addEventListener('keydown', onKey, true);

  // 透明度/快捷键在 options 改动后实时生效，无需刷新页面
  settingsStore.watch((ns) => {
    if (ns.danmakuOpacity !== currentOpacity) {
      currentOpacity = ns.danmakuOpacity;
      applyOpacity(ns.danmakuOpacity);
    }
    if (ns.danmakuHotkey && ns.danmakuHotkey !== hotkey) hotkey = ns.danmakuHotkey;
  });
}
