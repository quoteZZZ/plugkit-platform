// feature: 下载 / 导出——在播放页注入「下载封面」「下载视频」「下载字幕」「导出弹幕」
// 关键设计：
//  1) 视频交给浏览器下载管理器（后台 chrome.downloads）而非 content 内 blob()。
//     旧实现 fetch 整段视频 → blob → objectURL，几百 MB 的视频会直接把标签页内存打爆；
//     交给下载管理器还能获得进度、断点续传与正确的保存路径。
//  2) 元信息按当前 URL 的 bvid 校验。SPA 换视频后 __INITIAL_STATE__ 常停留在上一个视频，
//     直接用它会下载到「上一个视频」——这里不匹配就回源查一次 view 接口。
//  3) 一切都是 best-effort，失败都给明确 toast，不静默。
import { toast, sendMessage } from '@plugkit/core';
import { BiliSettings } from '../shared/types';
import { getMetaForCurrentVideo, urlBvid } from '../shared/meta';
import { waitFor } from './util';

const INFO_CONTAINER = '.video-info-container, .video-desc-container';

/** 内部消息通道：请求后台用 chrome.downloads 落盘 */
const DOWNLOAD_CHANNEL = 'bili/download';

/** 超过这个体积就不做 blob 降级（会把整段视频读进内存） */
const BLOB_FALLBACK_MAX = 80 * 1024 * 1024;

interface VideoMeta {
  bvid: string;
  cid: number;
  title: string;
  pic?: string;
}

/**
 * 取当前视频的 bvid / cid。
 * 优先用 MAIN world 桥接推来的页面状态；若桥接数据尚未跟上当前 bvid（SPA 刚切换），
 * 按 URL 的 bvid 回源查一次（多 P 视频按 ?p= 取对应分 P 的 cid）。
 */
async function resolveVideoMeta(): Promise<VideoMeta | null> {
  const bridged = await getMetaForCurrentVideo(1500);
  if (bridged?.bvid && bridged.cid) {
    return {
      bvid: bridged.bvid,
      cid: bridged.cid,
      title: bridged.title ?? '',
      pic: bridged.pic,
    };
  }
  const bv = urlBvid();
  if (!bv) return null;
  try {
    const p = Number(new URLSearchParams(location.search).get('p') ?? '1') || 1;
    const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bv}`, {
      credentials: 'include',
    });
    const j = (await res.json()) as any;
    if (j.code !== 0 || !j.data) return null;
    const cid = j.data.pages?.[p - 1]?.cid ?? j.data.cid;
    if (!cid) return null;
    return { bvid: bv, cid, title: j.data.title ?? '', pic: j.data.pic };
  } catch {
    return null;
  }
}

function injectButton(id: string, text: string, onClick: (btn: HTMLButtonElement) => void): void {
  if (document.querySelector(`#${id}`)) return;
  const container = document.querySelector(INFO_CONTAINER);
  if (!container) return;
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = text;
  btn.style.cssText =
    'margin-left:8px;padding:2px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer;font-size:12px;';
  btn.addEventListener('click', () => onClick(btn));
  container.appendChild(btn);
}

/** 由视频标题生成安全的文件名（去非法字符、截断） */
function safeFileName(title: string): string {
  const t = (title ?? 'video').replace(/[\\/:*?"<>|#]/g, '_').trim().slice(0, 60);
  return t || 'video';
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadCover(): Promise<void> {
  const meta = await resolveVideoMeta();
  if (!meta?.pic) {
    toast('未获取到封面', 'error');
    return;
  }
  try {
    const res = await fetch(meta.pic, { mode: 'cors' });
    saveBlob(await res.blob(), `${safeFileName(meta.title)}-cover.jpg`);
    toast('封面已开始下载', 'success');
  } catch {
    // CORS 受限：新标签打开，由用户右键保存
    window.open(meta.pic, '_blank');
    toast('已打开封面，可右键保存', 'info');
  }
}

async function exportDanmaku(btn: HTMLButtonElement): Promise<void> {
  const meta = await resolveVideoMeta();
  if (!meta?.cid) {
    toast('未获取到视频 cid', 'error');
    return;
  }
  btn.textContent = '导出中…';
  btn.disabled = true;
  try {
    // 新版 list.so 对部分视频已失效，comment.bilibili.com 仍返回 XML，两条都试
    const sources = [
      `https://api.bilibili.com/x/v1/dm/list.so?oid=${meta.cid}`,
      `https://comment.bilibili.com/${meta.cid}.xml`,
    ];
    let xml = '';
    for (const url of sources) {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) continue;
        const text = await res.text();
        if (text.includes('<d ') || text.includes('<i>')) {
          xml = text;
          break;
        }
      } catch {
        /* 换下一条 */
      }
    }
    if (!xml) throw new Error('弹幕接口均不可用（该视频可能无弹幕或接口已变更）');
    saveBlob(new Blob([xml], { type: 'application/xml' }), `danmaku_${meta.cid}.xml`);
    toast('弹幕已导出', 'success');
  } catch (e) {
    toast(`弹幕导出失败：${(e as Error).message}`, 'error');
  } finally {
    btn.textContent = '导出弹幕';
    btn.disabled = false;
  }
}

async function downloadVideo(btn: HTMLButtonElement): Promise<void> {
  const meta = await resolveVideoMeta();
  if (!meta) {
    toast('未获取到视频信息', 'error');
    return;
  }
  btn.textContent = '获取画质…';
  btn.disabled = true;
  try {
    // qn=112 请求 1080P+，无权限时服务端自动降级到可用最高画质
    const api = `https://api.bilibili.com/x/player/playurl?bvid=${meta.bvid}&cid=${meta.cid}&qn=112&fnval=0`;
    const res = await fetch(api, { credentials: 'include' });
    const json = (await res.json()) as {
      code: number;
      message?: string;
      data?: { durl?: { url?: string; backup_url?: string[]; size?: number }[] };
    };
    if (json.code !== 0 || !json.data?.durl?.length) {
      throw new Error(json.message ?? '未获取到可下载的直链');
    }
    const seg = json.data.durl[0];
    const videoUrl = seg.url || seg.backup_url?.[0];
    if (!videoUrl) throw new Error('直链为空');

    const ext = /\.flv(\?|$)/i.test(videoUrl) ? 'flv' : 'mp4';
    btn.textContent = '交给浏览器…';
    const r = await sendMessage<
      { url: string; filename: string },
      { ok: boolean; err?: string }
    >(DOWNLOAD_CHANNEL, { url: videoUrl, filename: `${safeFileName(meta.title)}.${ext}` });

    if (r?.ok) {
      toast('已加入浏览器下载', 'success');
      return;
    }
    // 后台下载失败（多为直链鉴权/Referer 问题）：小文件可退回页面内取流，
    // 大文件绝不做——会把整段视频读进内存。
    const size = seg.size ?? 0;
    if (size > 0 && size <= BLOB_FALLBACK_MAX) {
      btn.textContent = '下载中…';
      const vres = await fetch(videoUrl, { credentials: 'include' });
      if (!vres.ok) throw new Error(`视频流 HTTP ${vres.status}`);
      const blob = await vres.blob();
      if (blob.size === 0) throw new Error('视频流为空');
      saveBlob(blob, `${safeFileName(meta.title)}.${ext}`);
      toast('视频已开始下载', 'success');
      return;
    }
    throw new Error(r?.err ?? '浏览器下载器拒绝了该直链，请刷新页面后重试');
  } catch (e) {
    toast(`视频下载失败：${(e as Error).message}`, 'error');
  } finally {
    btn.textContent = '下载视频';
    btn.disabled = false;
  }
}

/** 下载字幕（player/v2 接口取字幕列表 → 转 Srt） */
async function downloadSubtitle(btn: HTMLButtonElement): Promise<void> {
  const meta = await resolveVideoMeta();
  if (!meta) {
    toast('未获取到视频信息', 'error');
    return;
  }
  btn.textContent = '查找字幕…';
  btn.disabled = true;
  try {
    const api = `https://api.bilibili.com/x/player/v2?bvid=${meta.bvid}&cid=${meta.cid}`;
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
      const sec = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      const pad = (n: number, l = 2) => String(n).padStart(l, '0');
      return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
    };
    const srt = body
      .map((c, i) => `${i + 1}\n${fmt(c.from)} --> ${fmt(c.to)}\n${c.content.replace(/\n/g, ' ')}\n`)
      .join('\n');
    saveBlob(new Blob([srt], { type: 'text/srt' }), `${safeFileName(meta.title)}.srt`);
    toast('字幕已下载（Srt）', 'success');
  } catch (e) {
    toast(`字幕下载失败：${(e as Error).message}`, 'error');
  } finally {
    btn.textContent = '下载字幕';
    btn.disabled = false;
  }
}

export function startDownloadTools(s: BiliSettings): void {
  if (!(s.coverDownload || s.videoDownload || s.subtitleDownload || s.danmakuExport)) return;
  void waitFor(INFO_CONTAINER, 6000).then((container) => {
    if (!container) return;
    // 一次就绪后统一注入，避免旧实现 4 路各自轮询 6 秒
    if (s.coverDownload) injectButton('plugkit-cover-dl', '下载封面', () => void downloadCover());
    if (s.videoDownload) injectButton('plugkit-video-dl', '下载视频', (b) => void downloadVideo(b));
    if (s.subtitleDownload) injectButton('plugkit-subtitle-dl', '下载字幕', (b) => void downloadSubtitle(b));
    if (s.danmakuExport) injectButton('plugkit-dm-export', '导出弹幕', (b) => void exportDanmaku(b));
  });
}
