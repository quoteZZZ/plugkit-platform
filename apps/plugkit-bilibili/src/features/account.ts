// feature: 账号工具——封面获取按钮 / UP 主属地显示 / BV-AV 互转
// 说明：每日签到走 background(chrome.alarms)，不在此模块。
import { BiliSettings } from '../shared/types';
import { waitFor } from './util';

/** 从页面全局状态取数据（videoData 在 window.__INITIAL_STATE__ 下） */
function getInitialState(): any {
  const w = window as unknown as Record<string, any>;
  return w.__INITIAL_STATE__ ?? w.__NEXT_DATA__;
}

// —— BV/AV 互转（B 站公开算法）——
const BV_TABLE = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF';
const BV_XOR = 177451812;
const BV_ADD = 8728348608;
const BV_POS = [11, 10, 3, 8, 4, 6];

export function av2bv(av: number): string {
  let x = (av ^ BV_XOR) + BV_ADD;
  const r = ['B', 'V', '1', '', '', '4', '', '1', '', '7', '', ''];
  for (let i = 0; i < 6; i++) {
    r[BV_POS[i]] = BV_TABLE[Math.floor(x / 58 ** i) % 58];
  }
  return r.join('');
}

export function bv2av(bv: string): number {
  let r = 0;
  for (let i = 0; i < 6; i++) {
    r += BV_TABLE.indexOf(bv[BV_POS[i]]) * 58 ** i;
  }
  return (r - BV_ADD) ^ BV_XOR;
}

// —— 封面获取 + UP 属地 ——
function addCoverButton(): void {
  void (async () => {
    const container = await waitFor('.video-info-container, .video-desc-container', 6000);
    if (!container) return;
    if (document.querySelector('#plugkit-cover-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'plugkit-cover-btn';
    btn.textContent = '复制封面';
    btn.style.cssText =
      'margin-left:8px;padding:2px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer;font-size:12px;';
    btn.addEventListener('click', () => {
      const pic = getInitialState()?.videoData?.pic;
      if (!pic) {
        btn.textContent = '未获取到封面';
        return;
      }
      void navigator.clipboard.writeText(pic);
      btn.textContent = '已复制 ✓';
      setTimeout(() => (btn.textContent = '复制封面'), 1500);
    });
    container.appendChild(btn);
  })();
}

function addCopyLinkButton(): void {
  void (async () => {
    const container = await waitFor('.video-info-container, .video-desc-container', 6000);
    if (!container) return;
    if (document.querySelector('#plugkit-copy-link')) return;
    const btn = document.createElement('button');
    btn.id = 'plugkit-copy-link';
    btn.textContent = '复制标题链接';
    btn.style.cssText =
      'margin-left:8px;padding:2px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer;font-size:12px;';
    btn.addEventListener('click', () => {
      const title = getInitialState()?.videoData?.title ?? document.title.replace(/_哔哩哔哩.*$/, '').trim();
      const text = `[${title}](${location.href})`;
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          btn.textContent = '已复制 ✓';
          setTimeout(() => (btn.textContent = '复制标题链接'), 1500);
        })
        .catch(() => {
          btn.textContent = '复制失败';
        });
    });
    container.appendChild(btn);
  })();
}

function addOwnerLocation(): void {
  void (async () => {
    const nameEl = await waitFor('.up-name, .bili-video-card__info--author, .name', 6000);
    if (!nameEl) return;
    if (document.querySelector('#plugkit-owner-loc')) return;
    const loc = getInitialState()?.videoData?.owner?.location;
    if (!loc) return;
    const span = document.createElement('span');
    span.id = 'plugkit-owner-loc';
    span.textContent = `属地 ${loc}`;
    span.style.cssText = 'margin-left:6px;font-size:12px;color:#57606a;';
    nameEl.parentElement?.appendChild(span);
  })();
}

export function startAccountTools(s: BiliSettings): void {
  if (s.coverButton) addCoverButton();
  if (s.copyLinkButton) addCopyLinkButton();
  if (s.showOwnerLocation) addOwnerLocation();
}
