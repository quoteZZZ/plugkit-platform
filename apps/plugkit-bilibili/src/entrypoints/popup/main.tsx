import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, StatCard, SectionTitle, Badge, Button } from '@plugkit/core/ui';
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

/** 近 7 天 PCDN 拦截趋势折线图（固定 7 天，缺失日期补 0） */
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
  const H = 64;
  const pad = 5;
  const stepX = (W - pad * 2) / (points.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * stepX).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');

  return (
    <div className="plugkit-card pk-stat">
      <div className="pk-stat-label">近7天拦截趋势（PCDN 次数）</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ marginTop: 8 }} aria-label="近7天拦截趋势">
        {/* 网格基线 */}
        <line x1={pad} y1={y(0)} x2={W - pad} y2={y(0)} stroke="var(--pk-border-soft)" strokeWidth="1" />
        <polyline
          points={path}
          fill="none"
          stroke="var(--pk-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={pad + i * stepX}
            cy={y(p.value)}
            r="2.6"
            fill="var(--pk-accent)"
            opacity={p.value > 0 ? 1 : 0.35}
          >
            <title>{`${p.date}: ${p.value} 次`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {points.map((p) => (
          <span key={p.date} style={{ fontSize: 9, color: 'var(--pk-text-muted)' }}>
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
    totalEstimatedMB: number;
    bgErrors: string[];
  } | null>(null);
  const [error, setError] = React.useState('');
  const [checkin, setCheckin] = React.useState('');

  const reload = React.useCallback(async () => {
    // 纯 storage 直读（不依赖后台消息通道）
    try {
      const raw = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY, 'plugkit:bili:heartbeat']);
      const settings = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
      const stats = { ...DEFAULT_STATS, ...((raw[STATS_KEY] ?? {}) as Partial<BiliStats>) };
      const hb = raw['plugkit:bili:heartbeat'] as { ts?: number; ok?: boolean; err?: string } | undefined;
      const todayEstimatedMB = Math.round(stats.todayPcdn * settings.avgChunkMB * 10) / 10;
      const totalEstimatedMB = Math.round(stats.totalPcdn * settings.avgChunkMB * 10) / 10;
      const bgErrors = hb
        ? hb.ok
          ? []
          : [`后台初始化失败：${hb.err ?? '未知原因'}。规则切换可能未生效。`]
        : ['后台尚未启动（SW 未运行）。PCDN 基础拦截由静态规则生效，规则切换/自动签到需后台运行。'];
      setSnap({ stats, settings, todayEstimatedMB, totalEstimatedMB, bgErrors });
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

  const onToggle = async (patch: Partial<BiliSettings>) => {
    await writeSettings(patch);
  };

  const onCheckin = async () => {
    setCheckin('签到中…');
    // popup 直连 B 站接口（有 host_permissions + credentials 带登录 cookie）
    try {
      const res = await fetch('https://api.bilibili.com/x/sign/doSign', { credentials: 'include' });
      const json = (await res.json()) as { code: number; message?: string; data?: { text?: string } };
      if (json.code === 0) setCheckin(json.data?.text ?? '签到成功');
      else if (json.code === -101) setCheckin('未登录 B 站，签到失败');
      else setCheckin(json.message ?? `签到失败(code=${json.code})`);
    } catch {
      setCheckin('签到失败：网络错误');
    }
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
              重置插件数据
            </Button>
          </div>
          <p className="pk-stat-sub" style={{ marginTop: 8 }}>
            重置会清空全部设置与统计，恢复到默认值。
          </p>
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

  const { stats, settings, todayEstimatedMB, totalEstimatedMB, bgErrors } = snap;
  const running = settings.masterOn;

  return (
    <Popup>
      <div className="plugkit-popup-header">
        <img src={chrome.runtime.getURL('icons/48.png')} width={28} height={28} style={{ borderRadius: 6 }} alt="" />
        <h3 style={{ flex: 1 }}>B站管理</h3>
        <Badge tone={running ? 'success' : 'muted'}>
          {running ? '运行中' : '已停用'}
        </Badge>
      </div>

      {bgErrors.length > 0 && (
        <div
          className="plugkit-card"
          style={{
            marginTop: 8,
            background: 'var(--pk-danger-weak)',
            borderColor: 'var(--pk-danger)',
            padding: '8px 12px',
          }}
        >
          <div className="pk-stat-label">后台提示</div>
          {bgErrors.map((msg, i) => (
            <div key={i} className="pk-stat-sub" style={{ color: 'var(--pk-danger)', marginTop: 2 }}>
              {msg}
            </div>
          ))}
        </div>
      )}

      <SectionTitle>拦截总开关</SectionTitle>
      <div className="plugkit-card" style={{ padding: '2px 14px' }}>
        <Toggle
          label="PCDN / 上传拦截"
          checked={settings.masterOn}
          onChange={(v) => void onToggle({ masterOn: v })}
        />
        <p className="pk-stat-sub" style={{ margin: '2px 0 8px' }}>
          {settings.masterOn
            ? `已启用 · 档位：${settings.aggressive ? '激进' : '标准'}`
            : '已停用，视频走原始 CDN（网页净化等其余功能不受影响）'}
        </p>
      </div>

      <SectionTitle>今日统计</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <StatCard
          label="PCDN 拦截"
          value={String(stats.todayPcdn)}
          sub={`累计 ${stats.totalPcdn} 次 · 估算省 ${todayEstimatedMB} MB`}
        />
        <StatCard
          label="阻止上传"
          value={fmtBytes(stats.todayP2pBytes)}
          sub={`${stats.todayP2pCalls} 次调用`}
        />
      </div>
      <StatCard
        label="清理广告"
        value={String(stats.todayAdRemoved)}
        sub={`累计 ${stats.totalAdRemoved} 个`}
      />

      {stats.daily.length > 0 && <TrendChart daily={stats.daily} />}

      <SectionTitle>功能开关</SectionTitle>
      <div className="plugkit-card" style={{ padding: '4px 14px' }}>
        <Toggle label="广告净化" checked={settings.adClean} onChange={(v) => void onToggle({ adClean: v })} />
        <Toggle label="播放增强" checked={settings.playerEnhance} onChange={(v) => void onToggle({ playerEnhance: v })} />
        <Toggle label="弹幕管理" checked={settings.danmaku} onChange={(v) => void onToggle({ danmaku: v })} />
        <Toggle label="账号工具" checked={settings.accountTools} onChange={(v) => void onToggle({ accountTools: v })} />
      </div>

      <SectionTitle>操作</SectionTitle>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={() => void onCheckin()}>
          立即签到
        </Button>
        <Button onClick={() => void browser.tabs.create({ url: 'https://www.bilibili.com/' })}>
          打开 B 站
        </Button>
        <Button onClick={() => void browser.runtime.openOptionsPage()}>
          详细设置
        </Button>
      </div>
      {checkin && <div className="pk-stat-sub" style={{ marginTop: 8 }}>{checkin}</div>}
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
