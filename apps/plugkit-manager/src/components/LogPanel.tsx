// 日志视图组件：级别过滤 + 刷新 + 清空 + 深色日志列表（新日志自动滚动到底部）
import { useEffect, useRef } from 'react';
import { Button } from '@plugkit/core/ui';
import type { LogEntry, LogLevel } from '@plugkit/core';

const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '#8c959f',
  info: '#58a6ff',
  warn: '#d29922',
  error: '#f85149',
};

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === new Date().toDateString();
  // 当日只显示时分秒；跨天补 MM-DD 前缀，便于追踪
  if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function LogPanel(props: {
  logs: LogEntry[];
  loading: boolean;
  minLevel: LogLevel;
  onMinLevel: (l: LogLevel) => void;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const { logs, loading, minLevel, onMinLevel, onRefresh, onClear } = props;
  const threshold = LEVEL_ORDER.indexOf(minLevel);
  const visible = logs.filter((e) => LEVEL_ORDER.indexOf(e.level) >= threshold);

  const listRef = useRef<HTMLDivElement>(null);
  // 日志条数变化（新增/清空）时滚动到底部，保证最新可见
  const count = visible.length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <select
          className="plugkit-input"
          value={minLevel}
          onChange={(e) => onMinLevel(e.target.value as LogLevel)}
        >
          {LEVEL_ORDER.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <Button onClick={onRefresh} disabled={loading}>
          {loading ? '读取中…' : '刷新'}
        </Button>
        <Button variant="danger" onClick={onClear}>
          清空
        </Button>
      </div>

      <div className="plugkit-log-list" ref={listRef}>
        {visible.length === 0 ? (
          <div className="plugkit-log-row">
            <span className="plugkit-log-msg" style={{ color: '#8c959f' }}>
              {loading ? '读取中…' : '暂无日志'}
            </span>
          </div>
        ) : (
          visible.map((e, i) => (
            // key 用 ts+ns+level 组合（附序号兜底），避免纯 index 在新日志插入时整列重排
            <div className="plugkit-log-row" key={`${e.ts}-${e.ns}-${e.level}-${i}`}>
              <span className="plugkit-log-time">{fmtTime(e.ts)}</span>
              <span className="plugkit-log-level" style={{ color: LEVEL_COLOR[e.level] }}>
                {e.level}
              </span>
              <span className="plugkit-log-msg">{e.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
