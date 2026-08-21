// 类型化消息总线：基于 wxt/browser（已抹平 chrome.* / browser.* 差异）
// 提供两种通信：
//   1) 一次性请求 send() —— 内部走 runtime.sendMessage / tabs.sendMessage
//   2) 长连接通道 defineChannel —— 高频通信时请使用 onMessage 的 Port 形态（见下）
import { browser } from 'wxt/browser';
import type { LogEntry } from '../logger';

// 消息信封标识，避免与原生扩展消息冲突
export const EXTKIT_TAG = '__plugkit__';

/** 跨插件状态/日志查询通道（plugkit-manager 用它拉取被管理插件的运行日志） */
export const PLUGKIT_STATUS_CHANNEL = 'plugkit/getStatus';

/** 跨插件清空日志通道 */
export const PLUGKIT_CLEAR_LOGS_CHANNEL = 'plugkit/clearLogs';

/** 被管理插件对 plugkit/getStatus 的响应 */
export interface PlugkitStatusReport {
  pluginId: string;
  version: string;
  logs: LogEntry[];
}

export interface Envelope<T = unknown> {
  [EXTKIT_TAG]: true;
  type: string;
  data: T;
}

type Handler<Req = unknown, Res = unknown> = (
  data: Req,
  sender: unknown,
) => Res | Promise<Res>;

/**
 * 定义一个类型安全的消息通道。
 * const ping = defineChannel<'PING', { pong: true }>('PING');
 * ping.on((data) => ({ pong: true }));        // 注册处理器
 * const res = await ping.send();               // 发送并等待响应
 */
export function defineChannel<Req = void, Res = void>(type: string) {
  const sendImpl = (data: Req, options?: { tabId?: number }) =>
    sendMessage<Req, Res>(type, data, options);

  return {
    type,
    // 当 Req 为 void 时，send() 可不传 data；否则 send(data)
    send: sendImpl as [Req] extends [void]
      ? (options?: { tabId?: number }) => Promise<Res>
      : (data: Req, options?: { tabId?: number }) => Promise<Res>,
    on: (handler: Handler<Req, Res>) => onMessage(type, handler),
  } as const;
}

/** 注册某类型消息的处理器（在 background / content 中调用） */
export function onMessage<Req = unknown, Res = unknown>(
  type: string,
  handler: Handler<Req, Res>,
): void {
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (msg && (msg as Envelope)[EXTKIT_TAG] && (msg as Envelope).type === type) {
      return handler((msg as Envelope<Req>).data, sender) as unknown;
    }
    return undefined;
  });
}

/** 发送一次性消息：不传 tabId 发往后台，传 tabId 发往该标签页的 content script */
export async function sendMessage<Req = unknown, Res = unknown>(
  type: string,
  data: Req,
  options?: { tabId?: number },
): Promise<Res> {
  const envelope: Envelope<Req> = { [EXTKIT_TAG]: true, type, data };
  if (options?.tabId != null) {
    return browser.tabs.sendMessage(options.tabId, envelope) as Promise<Res>;
  }
  return browser.runtime.sendMessage(envelope) as Promise<Res>;
}

/**
 * 高频长连接通道（性能优化点）：返回一个 Port 封装。
 * 连续多条消息请走这里，避免反复走一次性 sendMessage 的握手开销。
 */
export function openChannel(name: string) {
  const port = browser.runtime.connect({ name });
  return {
    post: (data: unknown) => port.postMessage(data),
    onMessage: (cb: (data: unknown) => void) => port.onMessage.addListener(cb),
    disconnect: () => port.disconnect(),
  };
}

/**
 * 跨插件消息：注册外部消息处理器（供 plugkit-manager 等平台拉取状态/日志）。
 * 依赖 `browser.runtime.onMessageExternal`；未声明 externally_connectable 时，
 * 默认允许所有扩展连接（仅本系列插件会在信封上带 EXTKIT_TAG 校验，天然隔离）。
 */
export function onExternalMessage<Req = unknown, Res = unknown>(
  type: string,
  handler: Handler<Req, Res>,
): void {
  browser.runtime.onMessageExternal.addListener((msg, sender) => {
    if (msg && (msg as Envelope)[EXTKIT_TAG] && (msg as Envelope).type === type) {
      return handler((msg as Envelope<Req>).data, sender) as unknown;
    }
    return undefined;
  });
}

/** 向另一扩展发送一次性消息（跨插件），返回其响应 */
export async function sendToExtension<Req = unknown, Res = unknown>(
  extensionId: string,
  type: string,
  data: Req,
): Promise<Res> {
  const envelope: Envelope<Req> = { [EXTKIT_TAG]: true, type, data };
  return browser.runtime.sendMessage(extensionId, envelope) as Promise<Res>;
}
