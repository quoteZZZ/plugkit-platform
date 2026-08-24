import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, Badge, Button, ChipToggle } from '@plugkit/core/ui';
import {
  BiliSettings,
  BiliStats,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  rollStats,
} from '../../shared/types';
import { fmtBytes } from '../../shared/format';

const SETTINGS_KEY = 'plugkit:bili:settings';
const STATS_KEY = 'plugkit:bili:stats';

/** 紧凑统计块（仅展示今日数值 + 累计，无对比） */
function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--pk-surface)',
        border: '1px solid var(--pk-border)',
        borderRadius: 10,
        padding: '8px 10px',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--pk-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--pk-text-muted)',
            marginTop: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {sub}
        </div>
      )}
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
    // 纯 storage 直读（不依赖后台消息通道）；读取即滚动，确保跨天后显示当天值
    try {
      const raw = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY, 'plugkit:bili:heartbeat']);
      const settings = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
      const stats = rollStats(
        { ...DEFAULT_STATS, ...((raw[STATS_KEY] ?? {}) as Partial<BiliStats>) } as BiliStats,
      );
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
                await chrome.storage.local.set({
                  [STATS_KEY]: { ...DEFAULT_STATS, today: todayStr(), lastResetAt: Date.now() },
                });
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
      {/* 顶部状态条 */}
      <div className="plugkit-popup-header">
        <img src={chrome.runtime.getURL('icons/48.png')} width={26} height={26} style={{ borderRadius: 6 }} alt="" />
        <h3 style={{ flex: 1, fontSize: 14 }}>B站管理</h3>
        <Badge tone={running ? 'success' : 'muted'}>{running ? '运行中' : '已停用'}</Badge>
      </div>
      <p style={{ fontSize: 11, color: 'var(--pk-text-muted)', margin: '0 0 10px' }}>
        今日已为你节省约 <b style={{ color: 'var(--pk-accent)' }}>{todayEstimatedMB}MB</b> 流量
      </p>

      {bgErrors.length > 0 && (
        <div
          title={bgErrors.join('；')}
          style={{
            marginBottom: 10,
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

      {/* 段1 · 今日概览 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <MiniStat
          label="PCDN 拦截"
          value={String(stats.todayPcdn)}
          sub={`累计 ${stats.totalPcdn}`}
        />
        <MiniStat
          label="阻止上传"
          value={fmtBytes(stats.todayP2pBytes)}
          sub={`${stats.todayP2pCalls} 次`}
        />
        <MiniStat
          label="清理广告"
          value={String(stats.todayAdRemoved)}
          sub={`累计 ${stats.totalAdRemoved}`}
        />
      </div>

      {/* 段2 · 拦截开关（突出总开关） */}
      <div className="plugkit-section-title">拦截</div>
      <div
        className="plugkit-card"
        style={{
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

      {/* 段3 · 核心功能（胶囊并排） */}
      <div className="plugkit-section-title">功能</div>
      <div className="plugkit-card" style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <ChipToggle label="广告净化" checked={settings.adClean} onChange={(v) => void writeSettings({ adClean: v })} />
        <ChipToggle label="播放增强" checked={settings.playerEnhance} onChange={(v) => void writeSettings({ playerEnhance: v })} />
        <ChipToggle label="弹幕管理" checked={settings.danmaku} onChange={(v) => void writeSettings({ danmaku: v })} />
        <ChipToggle label="账号工具" checked={settings.accountTools} onChange={(v) => void writeSettings({ accountTools: v })} />
        <ChipToggle label="夜间模式" checked={settings.nightMode} onChange={(v) => void writeSettings({ nightMode: v })} />
      </div>

      {/* 段4 · 操作 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
