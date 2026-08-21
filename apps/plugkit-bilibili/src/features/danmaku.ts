// feature: 弹幕管理——快捷键一键开关弹幕 + 弹幕透明度调节
// 说明：B 站新版播放器弹幕为 canvas 绘制，透明度通过容器级 CSS 生效（全模式可用）；
// 屏蔽词/字号等需 protobuf 响应级过滤，成本高，本期后置（options 中有说明）。
import { BiliSettings } from '../shared/types';

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

export function startDanmaku(s: BiliSettings): void {
  applyOpacity(s.danmakuOpacity);
  // Alt + D：一键开关弹幕
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        void toggleDanmaku();
      }
    },
    true,
  );
}
