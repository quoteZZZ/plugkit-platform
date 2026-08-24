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

/** 由视频标题生成安全的文件名（去非法字符、截断） */
function safeFileName(title: string): string {
  const t = (title ?? 'video').replace(/[\\/:*?"<>|#]/g, '_').trim().slice(0, 60);
  return t || 'video';
}

/** 下载视频（当前画质，durl 直链 → blob） */
async function downloadVideo(btn: HTMLButtonElement): Promise<void> {
  const vd = getInitialState()?.videoData as
    | { bvid?: string; cid?: number; title?: string }
    | undefined;
  if (!vd?.bvid || !vd?.cid) {
    toast('未获取到视频信息', 'error');
    return;
  }
  btn.textContent = '获取画质…';
  btn.disabled = true;
  try {
    // qn=112 请求 1080P+，无权限时服务端自动降级到可用最高画质
    const api = `https://api.bilibili.com/x/player/playurl?bvid=${vd.bvid}&cid=${vd.cid}&qn=112&fnval=0`;
    const res = await fetch(api, { credentials: 'include' });
    const json = (await res.json()) as {
      code: number;
      message?: string;
      data?: { durl?: { url?: string; backup_url?: string[] }[] };
    };
    if (json.code !== 0 || !json.data?.durl?.length) {
      throw new Error(json.message ?? '未获取到可下载的直链');
    }
    const videoUrl = json.data.durl[0].url || json.data.durl[0].backup_url?.[0];
    if (!videoUrl) throw new Error('直链为空');

    btn.textContent = '下载中…';
    const vres = await fetch(videoUrl, { credentials: 'include' });
    if (!vres.ok) throw new Error(`视频流 HTTP ${vres.status}`);
    const blob = await vres.blob();
    if (blob.size === 0) throw new Error('视频流为空');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(vd.title)}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
    toast('视频已开始下载', 'success');
  } catch (e) {
    toast(`视频下载失败：${(e as Error).message}`, 'error');
  } finally {
    btn.textContent = '下载视频';
    btn.disabled = false;
  }
}

/** 下载字幕（player/v2 接口取字幕列表 → 转 Srt） */
async function downloadSubtitle(btn: HTMLButtonElement): Promise<void> {
  const vd = getInitialState()?.videoData as
    | { bvid?: string; cid?: number; title?: string }
    | undefined;
  if (!vd?.bvid || !vd?.cid) {
    toast('未获取到视频信息', 'error');
    return;
  }
  btn.textContent = '查找字幕…';
  btn.disabled = true;
  try {
    const api = `https://api.bilibili.com/x/player/v2?bvid=${vd.bvid}&cid=${vd.cid}`;
    const res = await fetch(api, { credentials: 'include' });
    const json = (await res.json()) as {
      code: number;
      message?: string;
      data?: { subtitle?: { subtitles?: { lan_doc?: string; subtitle_url?: string }[] } };
    };
    const subs = json.data?.subtitle?.subtitles ?? [];
    const picked = subs.find((s) => s.subtitle_url) ?? subs[0];
    if (json.code !== 0 || !picked?.subtitle_url) {
      throw new Error('该视频没有可用字幕（需视频自带或登录后 AI 字幕）');
    }
    const subUrl = picked.subtitle_url.startsWith('//')
      ? `https:${picked.subtitle_url}`
      : picked.subtitle_url;

    btn.textContent = '下载字幕…';
    const sres = await fetch(subUrl, { credentials: 'include' });
    if (!sres.ok) throw new Error(`字幕 HTTP ${sres.status}`);
    const j = (await sres.json()) as {
      body?: { from: number; to: number; content: string }[];
    };
    const body = j.body ?? [];
    if (body.length === 0) throw new Error('字幕内容为空');

    // 转 Srt
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const ms = Math.round((sec - Math.floor(sec)) * 1000);
      const pad = (n: number, l = 2) => String(n).padStart(l, '0');
      return `${pad(h)}:${pad(m)}:${pad(Math.floor(sec))},${pad(ms, 3)}`;
    };
    const srt = body
      .map((c, i) => `${i + 1}\n${fmt(c.from)} --> ${fmt(c.to)}\n${c.content.replace(/\n/g, ' ')}\n`)
      .join('\n');
    const blob = new Blob([srt], { type: 'text/srt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(vd.title)}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    toast('字幕已下载（Srt）', 'success');
  } catch (e) {
    toast(`字幕下载失败：${(e as Error).message}`, 'error');
  } finally {
    btn.textContent = '下载字幕';
    btn.disabled = false;
  }
}

export function startDownloadTools(s: BiliSettings): void {
  if (s.coverDownload) {
    void waitFor('.video-info-container, .video-desc-container', 6000).then(() =>
      injectButton('plugkit-cover-dl', '下载封面', (b) => void downloadCover(b)),
    );
  }
  if (s.videoDownload) {
    void waitFor('.video-info-container, .video-desc-container', 6000).then(() =>
      injectButton('plugkit-video-dl', '下载视频', (b) => void downloadVideo(b)),
    );
  }
  if (s.subtitleDownload) {
    void waitFor('.video-info-container, .video-desc-container', 6000).then(() =>
      injectButton('plugkit-subtitle-dl', '下载字幕', (b) => void downloadSubtitle(b)),
    );
  }
  if (s.danmakuExport) {
    void waitFor('.video-info-container, .video-desc-container', 6000).then(() =>
      injectButton('plugkit-dm-export', '导出弹幕', (b) => void exportDanmaku(b)),
    );
  }
}
