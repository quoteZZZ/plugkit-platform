// 分级日志 + 环形缓冲：开发环境可打开 debug，生产环境调高 minLevel 即可静默。
// 除输出到 console 外，把最近 N 条日志写入 chrome.storage.local（防抖），
// 供管理平台跨插件读取，实现"插件日志监测"。
import { browser } from 'wxt/browser';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  /** 毫秒时间戳 */
  ts: number;
  level: LogLevel;
  /** 命名空间（如 bili-bg / hub-popup） */
  ns: string;
  /** 已格式化的消息文本 */
  msg: string;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_KEY = 'plugkit:logs';
const MAX_LOGS = 200;
const FLUSH_BATCH = 20;
const FLUSH_DELAY_MS = 1000;

let pending: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** 参数 → 可读字符串（对象/Error 尽量展开，避免 [object Object]） */
function stringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        const s = JSON.stringify(a);
        return s === undefined ? String(a) : s;
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

async function persist(): Promise<void> {
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  try {
    const raw = await browser.storage.local.get(LOG_KEY);
    const existing = (raw[LOG_KEY] as LogEntry[]) ?? [];
    const next = [...existing, ...batch].slice(-MAX_LOGS);
    await browser.storage.local.set({ [LOG_KEY]: next });
  } catch {
    /* storage 写入失败不阻断日志主流程 */
  }
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void persist();
  }, FLUSH_DELAY_MS);
}

export function createLogger(namespace: string, minLevel: LogLevel = 'info') {
  function emit(level: LogLevel, args: unknown[]): void {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const prefix = `%c[${namespace}]`;
    const style = 'color:#6f42c1;font-weight:bold';
    const consoleAny = console as unknown as Record<LogLevel, (...a: unknown[]) => void>;
    const fn = level === 'debug' ? console.log : consoleAny[level];
    fn(prefix, style, ...args);

    // 环形缓冲：高频日志批量落库，低频走防抖
    pending.push({ ts: Date.now(), level, ns: namespace, msg: stringify(args) });
    if (pending.length >= FLUSH_BATCH) void persist();
    else scheduleFlush();
  }

  return {
    debug: (...a: unknown[]) => emit('debug', a),
    info: (...a: unknown[]) => emit('info', a),
    warn: (...a: unknown[]) => emit('warn', a),
    error: (...a: unknown[]) => emit('error', a),
  };
}

/** 读取日志缓冲（可按命名空间过滤）；未持久化的 pending 先落库保证最新 */
export async function getLogs(ns?: string): Promise<LogEntry[]> {
  await persist();
  const raw = await browser.storage.local.get(LOG_KEY);
  const all = (raw[LOG_KEY] as LogEntry[]) ?? [];
  return ns ? all.filter((e) => e.ns === ns) : all;
}

/** 清空日志缓冲 */
export async function clearLogs(): Promise<void> {
  pending = [];
  await browser.storage.local.set({ [LOG_KEY]: [] });
}
