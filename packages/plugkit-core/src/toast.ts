// 轻量 toast 提示：在页面右下角浮出并自动消失。
// 用于"已复制 / 已下载"等反馈，提升功能可验证性（用户能确认操作成功）。
// 命令式调用，无需 React 挂载，故放在逻辑层（content script 也能用）。

export type ToastType = 'info' | 'success' | 'error';

let host: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'plugkit-toast-host';
  document.body.appendChild(host);
  return host;
}

/** 弹出一条提示，默认 2.2s 后消失 */
export function toast(message: string, type: ToastType = 'info', duration = 2200): void {
  const root = ensureHost();
  const el = document.createElement('div');
  el.className = `plugkit-toast plugkit-toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  // 下一帧触发进入动画
  requestAnimationFrame(() => el.classList.add('plugkit-toast-show'));
  window.setTimeout(() => {
    el.classList.remove('plugkit-toast-show');
    window.setTimeout(() => el.remove(), 240);
  }, duration);
}
