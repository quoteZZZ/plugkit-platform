import React from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsPage, Field, Toggle, Card, HotkeyInput } from '@plugkit/core/ui';
import {
  BiliSettings,
  BiliStats,
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  rollStats,
  todayStr,
} from '../../shared/types';
import { fmtBytes } from '../../shared/format';

const SETTINGS_KEY = 'plugkit:bili:settings';
const STATS_KEY = 'plugkit:bili:stats';

function App() {
  const [data, setData] = React.useState<{ stats: BiliStats; settings: BiliSettings } | null>(null);
  const [error, setError] = React.useState('');
  const [speedInput, setSpeedInput] = React.useState('1');
  const [hotkeyInput, setHotkeyInput] = React.useState('Alt+D');
  const [nightHotkeyInput, setNightHotkeyInput] = React.useState('Alt+N');
  const [allowlistInput, setAllowlistInput] = React.useState('');
  /** 弹幕透明度：拖动期间只改本地，松手才落库（避免每格一次 storage 写入） */
  const [opacityInput, setOpacityInput] = React.useState(100);
  /** 清零统计二次确认（MV3 扩展页禁用 confirm，用内联交互替代） */
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [speedError, setSpeedError] = React.useState('');

  // init=true 时初始化输入框 state；false 仅刷新数据（避免覆盖正在编辑的输入）
  const reload = React.useCallback(async (init = false) => {
    try {
      const raw = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY]);
      const settings = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
      const stats = rollStats({ ...DEFAULT_STATS, ...((raw[STATS_KEY] ?? {}) as Partial<BiliStats>) } as BiliStats);
      setData({ stats, settings });
      setError('');
      if (init) {
        setSpeedInput(String(settings.customSpeed));
        setHotkeyInput(settings.danmakuHotkey);
        setNightHotkeyInput(settings.nightModeHotkey);
        setAllowlistInput((settings.pcdnAllowlist ?? []).join(', '));
        setOpacityInput(settings.danmakuOpacity);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  React.useEffect(() => {
    void reload(true);
  }, [reload]);

  // 实时刷新：settings/stats 变化自动重新加载（content 上报 / 其他页面修改）
  React.useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes[SETTINGS_KEY] || changes[STATS_KEY])) {
        void reload(false);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [reload]);

  /** 直写设置（storage.onChanged 驱动后台规则应用） */
  const onToggle = async (patch: Partial<BiliSettings>) => {
    const raw = await chrome.storage.local.get(SETTINGS_KEY);
    const cur = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
    await chrome.storage.local.set({ [SETTINGS_KEY]: { ...cur, ...patch } });
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    await chrome.storage.local.set({
      [STATS_KEY]: { ...DEFAULT_STATS, today: todayStr(), lastResetAt: Date.now() },
    });
    setConfirmReset(false);
    await reload(false);
  };

  const onSpeed = async () => {
    const v = parseFloat(speedInput);
    if (Number.isFinite(v) && v >= 0.1 && v <= 16) {
      setSpeedError('');
      await onToggle({ customSpeed: v });
    } else {
      setSpeedError('倍速需在 0.1 – 16 之间');
    }
  };

  const onAllowlist = async () => {
    const domains = allowlistInput
      .split(/[,，\s]+/)
      .map((d) => d.trim().toLowerCase())
      .filter((d) => /^[a-z0-9.-]+$/.test(d));
    await onToggle({ pcdnAllowlist: domains });
  };

  if (!data) {
    return (
      <OptionsPage title="B站管理 · 设置">
        {error ? (
          <Card>
            <div className="pk-stat-label">读取失败</div>
            <div className="pk-stat-value" style={{ fontSize: 14 }}>{error}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="plugkit-btn plugkit-btn-primary" onClick={() => void reload(true)}>
                重试
              </button>
              <button
                className="plugkit-btn plugkit-btn-danger"
                onClick={async () => {
                  await chrome.storage.local.remove([SETTINGS_KEY, STATS_KEY]);
                  await reload(true);
                }}
              >
                重置
              </button>
            </div>
          </Card>
        ) : (
          '读取中…'
        )}
      </OptionsPage>
    );
  }

  const { stats, settings } = data;

  return (
    <OptionsPage title="B站管理 · 设置">
      <Card title="🛡 拦截">
        <Toggle
          label="PCDN / 上传拦截"
          checked={settings.masterOn}
          onChange={(v) => onToggle({ masterOn: v })}
        />
        <Toggle
          label="激进档（连正常 CDN 一起拦，可能影响加载）"
          checked={settings.aggressive}
          onChange={(v) => onToggle({ aggressive: v })}
        />
        <Toggle
          label="阻止直播 WebRTC 上传"
          checked={settings.blockP2p}
          onChange={(v) => onToggle({ blockP2p: v })}
        />
        <Field label="例外域名">
          <input
            className="plugkit-input"
            value={allowlistInput}
            onChange={(e) => setAllowlistInput(e.target.value)}
            onBlur={() => void onAllowlist()}
            style={{ flex: 1, minWidth: 160 }}
            placeholder="cdn.example.com"
          />
          <button className="plugkit-btn" style={{ marginLeft: 8 }} onClick={() => void onAllowlist()}>
            保存
          </button>
        </Field>
        {stats.lastP2pBlock && (
          <p className="pk-stat-sub" style={{ margin: '4px 0 0' }}>
            P2P 最近拦截：{new Date(stats.lastP2pBlock).toLocaleString()}
          </p>
        )}
      </Card>

      <Card title="🧹 页面">
        <Toggle label="清理广告 / 推广元素" checked={settings.adClean} onChange={(v) => onToggle({ adClean: v })} />
        <Toggle label="夜间模式" checked={settings.nightMode} onChange={(v) => onToggle({ nightMode: v })} />
        <Field label="夜间快捷键">
          <HotkeyInput
            value={nightHotkeyInput}
            onChange={(v) => {
              setNightHotkeyInput(v);
              void onToggle({ nightModeHotkey: v });
            }}
          />
        </Field>
      </Card>

      <Card title="▶️ 播放">
        <Toggle
          label="播放增强"
          checked={settings.playerEnhance}
          onChange={(v) => onToggle({ playerEnhance: v })}
        />
        <Field label="固定倍速">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={speedInput}
              onChange={(e) => setSpeedInput(e.target.value)}
              style={{ width: 120, verticalAlign: 'middle' }}
            />
            <span style={{ minWidth: 42, fontSize: 13 }}>{Number(speedInput).toFixed(2)}x</span>
            {[1.25, 1.5, 2].map((p) => (
              <button
                key={p}
                className="plugkit-btn"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={() => {
                  setSpeedInput(String(p));
                  void onToggle({ customSpeed: p });
                }}
              >
                {p}x
              </button>
            ))}
            <button className="plugkit-btn" onClick={onSpeed} style={{ padding: '2px 10px', fontSize: 12 }}>
              应用
            </button>
            {speedError && (
              <span style={{ fontSize: 12, color: 'var(--pk-danger)', width: '100%' }}>{speedError}</span>
            )}
          </div>
        </Field>
        <Toggle label="自动宽屏" checked={settings.autoWidescreen} onChange={(v) => onToggle({ autoWidescreen: v })} />
        <Toggle label="记忆播放进度" checked={settings.rememberProgress} onChange={(v) => onToggle({ rememberProgress: v })} />
        <Toggle
          label="精确统计数字"
          checked={settings.preciseStats}
          onChange={(v) => onToggle({ preciseStats: v })}
        />
      </Card>

      <Card title="💬 弹幕">
        <Toggle label="弹幕管理" checked={settings.danmaku} onChange={(v) => onToggle({ danmaku: v })} />
        <Field label="弹幕快捷键">
          <HotkeyInput
            value={hotkeyInput}
            onChange={(v) => {
              setHotkeyInput(v);
              void onToggle({ danmakuHotkey: v });
            }}
          />
        </Field>
        <Field label="透明度">
          <input
            type="range"
            min={10}
            max={100}
            value={opacityInput}
            onChange={(e) => setOpacityInput(Number(e.target.value))}
            onPointerUp={() => void onToggle({ danmakuOpacity: opacityInput })}
            onKeyUp={() => void onToggle({ danmakuOpacity: opacityInput })}
            style={{ width: 140, verticalAlign: 'middle' }}
          />
          <span style={{ marginLeft: 8 }}>{opacityInput}%</span>
        </Field>
      </Card>

      <Card title="⬇️ 下载 / 导出">
        <Toggle label="下载封面" checked={settings.coverDownload} onChange={(v) => onToggle({ coverDownload: v })} />
        <Toggle label="下载视频" checked={settings.videoDownload} onChange={(v) => onToggle({ videoDownload: v })} />
        <Toggle label="导出弹幕（XML）" checked={settings.danmakuExport} onChange={(v) => onToggle({ danmakuExport: v })} />
      </Card>

      <Card title="👤 账号">
        <Toggle label="每日自动签到" checked={settings.autoCheckin} onChange={(v) => onToggle({ autoCheckin: v })} />
      </Card>

      <Card title="📊 统计">
        <Field label="今日拦截">{stats.todayPcdn} 次（累计 {stats.totalPcdn}）</Field>
        <Field label="今日阻止上传">
          {fmtBytes(stats.todayP2pBytes)}（{stats.todayP2pCalls} 次）
        </Field>
        <Field label="今日清理广告">{stats.todayAdRemoved} 个（累计 {stats.totalAdRemoved}）</Field>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          {confirmReset ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--pk-danger)' }}>确认清零？</span>
              <button className="plugkit-btn plugkit-btn-danger" onClick={() => void onReset()}>
                确认
              </button>
              <button className="plugkit-btn" onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </>
          ) : (
            <button className="plugkit-btn plugkit-btn-danger" onClick={() => void onReset()}>
              清零统计
            </button>
          )}
        </div>
      </Card>
    </OptionsPage>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
