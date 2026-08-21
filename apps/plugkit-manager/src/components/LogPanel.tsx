// 日志视图组件：级别过滤 + 刷新 + 清空 + 深色日志列表
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
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
        <button className="plugkit-btn" onClick={onRefresh} disabled={loading}>
          {loading ? '读取中…' : '刷新'}
        </button>
        <button className="plugkit-btn plugkit-btn-danger" onClick={onClear}>
          清空
        </button>
      </div>

      <div className="plugkit-log-list">
        {visible.length === 0 ? (
          <div className="plugkit-log-row">
            <span className="plugkit-log-msg" style={{ color: '#8c959f' }}>
              {loading ? '读取中…' : '暂无日志'}
            </span>
          </div>
        ) : (
          visible.map((e, i) => (
            <div className="plugkit-log-row" key={i}>
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
