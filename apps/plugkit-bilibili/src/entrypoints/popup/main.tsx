import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, Badge, Button } from '@plugkit/core/ui';
import {
  BiliSettings,
  BiliStats,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  DayStat,
} from '../../shared/types';
import { fmtBytes } from '../../shared/format';

const SETTINGS_KEY = 'plugkit:bili:settings';
const STATS_KEY = 'plugkit:bili:stats';

/** 紧凑统计块（3 列布局用） */
function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: 'var(--pk-surface)',
        border: '1px solid var(--pk-border)',
        borderRadius: 8,
        padding: '6px 8px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--pk-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 1, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--pk-text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** 近 7 天 PCDN 拦截趋势折线图（紧凑） */
function TrendChart({ daily }: { daily: DayStat[] }) {
  const points = React.useMemo(() => {
    const map = new Map(daily.map((d) => [d.date, d.pcdn]));
    const arr: { date: string; label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      arr.push({
        date: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        value: map.get(key) ?? 0,
      });
    }
    return arr;
  }, [daily]);

  const max = Math.max(...points.map((p) => p.value), 1);
  const W = 280;
  const H = 38;
  const pad = 4;
  const stepX = (W - pad * 2) / (points.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * stepX).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');

  return (
    <div
      style={{
        marginTop: 8,
        background: 'var(--pk-surface)',
        border: '1px solid var(--pk-border)',
        borderRadius: 8,
        padding: '6px 10px 4px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--pk-text-secondary)' }}>近7天拦截趋势</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-label="近7天拦截趋势">
        <line x1={pad} y1={y(0)} x2={W - pad} y2={y(0)} stroke="var(--pk-border-soft)" strokeWidth="1" />
        <polyline
          points={path}
          fill="none"
          stroke="var(--pk-accent)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={pad + i * stepX}
            cy={y(p.value)}
            r="2.2"
            fill="var(--pk-accent)"
            opacity={p.value > 0 ? 1 : 0.35}
          >
            <title>{`${p.date}: ${p.value} 次`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {points.map((p) => (
          <span key={p.date} style={{ fontSize: 8, color: 'var(--pk-text-muted)' }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [snap, setSnap] = React.useState<{
    stats: BiliStats;
    settings: BiliSettings;
    todayEstimatedMB: number;
    bgErrors: string[];
  } | null>(null);
  const [error, setError] = React.useState('');

  const reload = React.useCallback(async () => {
    // 纯 storage 直读（不依赖后台消息通道）
    try {
      const raw = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY, 'plugkit:bili:heartbeat']);
      const settings = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
      const stats = { ...DEFAULT_STATS, ...((raw[STATS_KEY] ?? {}) as Partial<BiliStats>) };
      const hb = raw['plugkit:bili:heartbeat'] as { ok?: boolean; err?: string } | undefined;
      const todayEstimatedMB = Math.round(stats.todayPcdn * settings.avgChunkMB * 10) / 10;
      const bgErrors = hb
        ? hb.ok
          ? []
          : [`后台初始化失败：${hb.err ?? '未知原因'}`]
        : ['后台未启动（SW 未运行）']; // 拦截/签到等后台功能需其运行
      setSnap({ stats, settings, todayEstimatedMB, bgErrors });
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // 实时刷新：settings/stats 变化（content 上报、其他页面修改）自动重新加载
  React.useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes[SETTINGS_KEY] || changes[STATS_KEY])) {
        void reload();
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  /** 直写设置（storage.onChanged 驱动后台规则应用） */
  const writeSettings = async (patch: Partial<BiliSettings>) => {
    const raw = await chrome.storage.local.get(SETTINGS_KEY);
    const cur = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
    await chrome.storage.local.set({ [SETTINGS_KEY]: { ...cur, ...patch } });
  };

  if (error) {
    return (
      <Popup>
        <div className="plugkit-card">
          <div className="pk-stat-label">错误</div>
          <div className="pk-stat-value" style={{ fontSize: 14 }}>{error}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => void reload()}>
              重试
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await chrome.storage.local.remove([SETTINGS_KEY, STATS_KEY]);
                setError('');
                await reload();
              }}
            >
              重置数据
            </Button>
          </div>
        </div>
      </Popup>
    );
  }
  if (!snap) {
    return (
      <Popup>
        <div className="plugkit-card">
          <div className="pk-stat-label">加载中</div>
          <div className="pk-stat-value" style={{ fontSize: 14 }}>…</div>
        </div>
      </Popup>
    );
  }

  const { stats, settings, todayEstimatedMB, bgErrors } = snap;
  const running = settings.masterOn;

  return (
    <Popup>
      <div className="plugkit-popup-header">
        <img src={chrome.runtime.getURL('icons/48.png')} width={26} height={26} style={{ borderRadius: 6 }} alt="" />
        <h3 style={{ flex: 1, fontSize: 14 }}>B站管理</h3>
        <Badge tone={running ? 'success' : 'muted'}>
          {running ? '运行中' : '已停用'}
        </Badge>
      </div>

      {bgErrors.length > 0 && (
        <div
          title={bgErrors.join('；')}
          style={{
            marginTop: 6,
            padding: '3px 10px',
            borderRadius: 8,
            background: 'var(--pk-danger-weak)',
            border: '1px solid var(--pk-danger)',
            color: 'var(--pk-danger)',
            fontSize: 11,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {bgErrors[0]}
          {bgErrors.length > 1 ? `（共 ${bgErrors.length} 条）` : ''}
        </div>
      )}

      {/* 拦截总开关 */}
      <div
        className="plugkit-card"
        style={{
          marginTop: 8,
          padding: '2px 12px',
          background: running ? 'var(--pk-accent-weak)' : undefined,
          borderColor: running ? 'var(--pk-accent)' : undefined,
        }}
      >
        <Toggle label="PCDN / 上传拦截" checked={running} onChange={(v) => void writeSettings({ masterOn: v })} />
        <div className="pk-stat-sub" style={{ margin: '0 0 6px' }}>
          {running ? `档位：${settings.aggressive ? '激进' : '标准'}` : '已停用（其余功能不受影响）'}
        </div>
      </div>

      {/* 今日统计（3 列） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
        <MiniStat label="PCDN 拦截" value={String(stats.todayPcdn)} sub={`省 ${todayEstimatedMB}MB`} />
        <MiniStat label="阻止上传" value={fmtBytes(stats.todayP2pBytes)} sub={`${stats.todayP2pCalls}次`} />
        <MiniStat label="清理广告" value={String(stats.todayAdRemoved)} sub={`累计 ${stats.totalAdRemoved}`} />
      </div>

      {stats.daily.length > 0 && <TrendChart daily={stats.daily} />}

      {/* 功能开关 */}
      <div className="plugkit-card" style={{ marginTop: 8, padding: '2px 12px' }}>
        <Toggle label="广告净化" checked={settings.adClean} onChange={(v) => void writeSettings({ adClean: v })} />
        <Toggle label="播放增强" checked={settings.playerEnhance} onChange={(v) => void writeSettings({ playerEnhance: v })} />
        <Toggle label="弹幕管理" checked={settings.danmaku} onChange={(v) => void writeSettings({ danmaku: v })} />
        <Toggle label="账号工具" checked={settings.accountTools} onChange={(v) => void writeSettings({ accountTools: v })} />
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button style={{ flex: 1 }} onClick={() => void browser.tabs.create({ url: 'https://www.bilibili.com/' })}>
          打开 B 站
        </Button>
        <Button style={{ flex: 1 }} onClick={() => void browser.runtime.openOptionsPage()}>
          详细设置
        </Button>
      </div>
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
