// feature: 账号工具——复制封面 / 复制标题链接 / UP 主属地显示
// 数据来源：shared/meta（由 MAIN world 桥接脚本推送）。
// 注意：不能直接读 window.__INITIAL_STATE__——content script 在 isolated world 里读它是 undefined。
import { BiliSettings } from '../shared/types';
import { getMetaForCurrentVideo } from '../shared/meta';
import { waitFor } from './util';

const INFO_CONTAINER = '.video-info-container, .video-desc-container';
const OWNER_LOC_ID = 'plugkit-owner-loc';

function buttonCss(): string {
  return 'margin-left:8px;padding:2px 10px;border:1px solid #d0d7de;border-radius:6px;background:#f6f8fa;cursor:pointer;font-size:12px;';
}

function addCopyCover(container: Element): void {
  if (document.querySelector('#plugkit-cover-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'plugkit-cover-btn';
  btn.textContent = '复制封面';
  btn.style.cssText = buttonCss();
  btn.addEventListener('click', () => {
    void (async () => {
      const meta = await getMetaForCurrentVideo(1500);
      if (!meta?.pic) {
        btn.textContent = '未获取到封面';
        setTimeout(() => (btn.textContent = '复制封面'), 1500);
        return;
      }
      void navigator.clipboard.writeText(meta.pic);
      btn.textContent = '已复制 ✓';
      setTimeout(() => (btn.textContent = '复制封面'), 1500);
    })();
  });
  container.appendChild(btn);
}

function addCopyLink(container: Element): void {
  if (document.querySelector('#plugkit-copy-link')) return;
  const btn = document.createElement('button');
  btn.id = 'plugkit-copy-link';
  btn.textContent = '复制标题链接';
  btn.style.cssText = buttonCss();
  btn.addEventListener('click', () => {
    void (async () => {
      const meta = await getMetaForCurrentVideo(800);
      const title =
        meta?.title ?? document.title.replace(/_哔哩哔哩.*$/, '').trim();
      try {
        await navigator.clipboard.writeText(`[${title}](${location.href})`);
        btn.textContent = '已复制 ✓';
      } catch {
        btn.textContent = '复制失败';
      }
      setTimeout(() => (btn.textContent = '复制标题链接'), 1500);
    })();
  });
  container.appendChild(btn);
}

/**
 * UP 主属地标签。
 * SPA 换视频时软导航不会重新注入脚本，以 pathname 为界：换页先移除上一页的标签，
 * 等桥接数据跟上当前 bvid 后再注入——宁可不显示，也不显示上一个视频的属地。
 */
function startOwnerLocation(): void {
  let key = location.pathname;

  const sync = async (): Promise<void> => {
    if (location.pathname !== key) {
      key = location.pathname;
      document.getElementById(OWNER_LOC_ID)?.remove();
    }
    if (document.getElementById(OWNER_LOC_ID)) return;
    const meta = await getMetaForCurrentVideo(1000);
    if (!meta?.ownerLocation) return;
    const nameEl = document.querySelector('.up-name');
    if (!nameEl) return;
    const span = document.createElement('span');
    span.id = OWNER_LOC_ID;
    span.textContent = `属地 ${meta.ownerLocation}`;
    span.style.cssText = 'margin-left:6px;font-size:12px;color:#57606a;';
    nameEl.parentElement?.appendChild(span);
  };

  void sync();
  // B 站用 pushState 软导航，没有可监听的路由事件；2s 比对一次 pathname 成本可忽略
  setInterval(() => void sync(), 2000);
}

export function startAccountTools(s: BiliSettings): void {
  void (async () => {
    // 两个按钮共用同一个信息容器：统一等一次就绪再注入，避免各自轮询
    if (s.coverButton || s.copyLinkButton) {
      const container = await waitFor(INFO_CONTAINER, 6000);
      if (container) {
        if (s.coverButton) addCopyCover(container);
        if (s.copyLinkButton) addCopyLink(container);
      }
    }
    if (s.showOwnerLocation) startOwnerLocation();
  })();
}
