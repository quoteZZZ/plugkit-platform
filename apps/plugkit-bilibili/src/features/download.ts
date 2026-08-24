// feature: 下载 / 导出——在播放页注入「下载封面」「导出弹幕」按钮
// 均为 best-effort：跨域受限时降级（新标签打开 / 错误提示），并用 toast 反馈结果，提升可验证性。
import { toast } from '@plugkit/core';
import { BiliSettings } from '../shared/types';
import { waitFor } from './util';

function getInitialState(): any {
  const w = window as unknown as Record<string, any>;
  return w.__INITIAL_STATE__ ?? w.__NEXT_DATA__;
}

function injectButton(
  id: string,
  text: string,
  onClick: (btn: HTMLButtonElement) => void,
): void {
  const container = document.querySelector('.video-info-container, .video-desc-container');
  if (!container || document.querySelector(`#${id}`)) return;
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = text;
  btn.style.cssText =
    'margin-left:8px;padding:2px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer;font-size:12px;';
  btn.addEventListener('click', () => onClick(btn));
  container.appendChild(btn);
}

async function downloadCover(btn: HTMLButtonElement): Promise<void> {
  const pic = getInitialState()?.videoData?.pic as string | undefined;
  if (!pic) {
    toast('未获取到封面', 'error');
    return;
  }
  try {
    const res = await fetch(pic, { mode: 'cors' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cover_${Date.now()}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    toast('封面已开始下载', 'success');
  } catch {
    // CORS 受限：新标签打开，由用户右键保存
    window.open(pic, '_blank');
    toast('已打开封面，可右键保存', 'info');
  }
}

async function exportDanmaku(btn: HTMLButtonElement): Promise<void> {
  const cid = getInitialState()?.videoData?.cid as number | undefined;
  if (!cid) {
    toast('未获取到视频 cid', 'error');
    return;
  }
  btn.textContent = '导出中…';
  btn.disabled = true;
  try {
    const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
      credentials: 'include',
    });
    const text = await res.text();
    if (!text.includes('<')) throw new Error('返回格式异常');
    const blob = new Blob([text], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danmaku_${cid}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast('弹幕已导出', 'success');
  } catch (e) {
    toast(`弹幕导出失败：${(e as Error).message}`, 'error');
  } finally {
    btn.textContent = '导出弹幕';
    btn.disabled = false;
  }
}

export function startDownloadTools(s: BiliSettings): void {
  if (s.coverDownload) {
    void waitFor('.video-info-container, .video-desc-container', 6000).then(() =>
      injectButton('plugkit-cover-dl', '下载封面', (b) => void downloadCover(b)),
    );
  }
  if (s.danmakuExport) {
    void waitFor('.video-info-container, .video-desc-container', 6000).then(() =>
      injectButton('plugkit-dm-export', '导出弹幕', (b) => void exportDanmaku(b)),
    );
  }
}
