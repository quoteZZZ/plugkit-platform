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
  const [chunkInput, setChunkInput] = React.useState('2');
  const [speedInput, setSpeedInput] = React.useState('1');
  const [hotkeyInput, setHotkeyInput] = React.useState('Alt+D');
  const [nightHotkeyInput, setNightHotkeyInput] = React.useState('Alt+N');
  const [allowlistInput, setAllowlistInput] = React.useState('');

  // init=true 时初始化输入框 state；false 仅刷新数据（避免覆盖用户正在编辑的输入）
  const reload = React.useCallback(async (init = false) => {
    try {
      const raw = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY]);
      const settings = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
      const stats = rollStats({ ...DEFAULT_STATS, ...((raw[STATS_KEY] ?? {}) as Partial<BiliStats>) } as BiliStats);
      setData({ stats, settings });
      setError('');
      if (init) {
        setChunkInput(String(settings.avgChunkMB));
        setSpeedInput(String(settings.customSpeed));
        setHotkeyInput(settings.danmakuHotkey);
        setNightHotkeyInput(settings.nightModeHotkey);
        setAllowlistInput((settings.pcdnAllowlist ?? []).join(', '));
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
  const writeSettings = async (patch: Partial<BiliSettings>) => {
    const raw = await chrome.storage.local.get(SETTINGS_KEY);
    const cur = { ...DEFAULT_SETTINGS, ...((raw[SETTINGS_KEY] ?? {}) as Partial<BiliSettings>) };
    await chrome.storage.local.set({ [SETTINGS_KEY]: { ...cur, ...patch } });
  };

  const onToggle = async (patch: Partial<BiliSettings>) => {
    await writeSettings(patch);
  };
  const onReset = async () => {
    if (confirm('确定清零全部统计？')) {
      await chrome.storage.local.set({ [STATS_KEY]: { ...DEFAULT_STATS, today: todayStr() } });
    }
  };
  const onChunk = async () => {
    const v = parseFloat(chunkInput);
    if (Number.isFinite(v) && v > 0) await onToggle({ avgChunkMB: v });
  };
  const onSpeed = async () => {
    const v = parseFloat(speedInput);
    if (Number.isFinite(v) && v >= 0.1 && v <= 16) await onToggle({ customSpeed: v });
    else alert('倍速需在 0.1 – 16 之间');
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
            <div className="pk-stat-label">错误</div>
            <div className="pk-stat-value" style={{ fontSize: 14 }}>{error}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="plugkit-btn plugkit-btn-primary" onClick={() => void reload(true)}>重试</button>
              <button
                className="plugkit-btn plugkit-btn-danger"
                onClick={async () => {
                  await chrome.storage.local.remove([SETTINGS_KEY, STATS_KEY]);
                  setError('');
                  await reload(true);
                }}
              >
                重置插件数据
              </button>
            </div>
            <p className="pk-stat-sub" style={{ marginTop: 8 }}>重置会清空全部设置与统计，恢复到默认值。</p>
          </Card>
        ) : (
          '加载中…'
        )}
      </OptionsPage>
    );
  }
  const { stats, settings } = data;

  return (
    <OptionsPage title="B站管理 · 设置">
      <p className="subtitle">拦截资源占用、净化页面、增强播放、管理弹幕、账号工具——全部开关与参数。</p>

      <Card title="🛡 拦截">
        <Toggle label="PCDN 域名拦截" checked={settings.masterOn} onChange={(v) => onToggle({ masterOn: v })} />
        <Toggle label="激进档：全部 *.bilivideo.cn 等（慎开）" checked={settings.aggressive} onChange={(v) => onToggle({ aggressive: v })} />
        <Toggle label="阻止直播 WebRTC(P2P) 上传" checked={settings.blockP2p} onChange={(v) => onToggle({ blockP2p: v })} />
        <Field label="例外域名">
          <input
            className="plugkit-input"
            value={allowlistInput}
            onChange={(e) => setAllowlistInput(e.target.value)}
            onBlur={() => void onAllowlist()}
            style={{ flex: 1, minWidth: 180 }}
            placeholder="cdn.example.com, mirror.example.net"
          />
          <button className="plugkit-btn" onClick={() => void onAllowlist()}>保存</button>
          <span className="pk-stat-sub">逗号分隔，命中域名不拦截（处理误伤）</span>
        </Field>
        <Field label="估算分片 (MB)">
          <input className="plugkit-input" type="number" value={chunkInput} onChange={(e) => setChunkInput(e.target.value)} style={{ width: 80 }} />
          <button className="plugkit-btn" style={{ marginLeft: 8 }} onClick={onChunk}>保存</button>
        </Field>
        {stats.lastP2pBlock && (
          <p className="pk-stat-sub" style={{ marginTop: 4 }}>
            P2P 拦截最近生效：{new Date(stats.lastP2pBlock).toLocaleString()}（仅在看直播时拦截 WebRTC 上传）
          </p>
        )}
      </Card>

      <Card title="🌙 夜间模式">
        <Toggle label="启用夜间模式（暗色主题）" checked={settings.nightMode} onChange={(v) => onToggle({ nightMode: v })} />
        <Field label="夜间模式快捷键">
          <HotkeyInput value={nightHotkeyInput} onChange={(v) => { setNightHotkeyInput(v); void onToggle({ nightModeHotkey: v }); }} />
          <span className="pk-stat-sub">点击输入框后按下组合键录制，失焦取消</span>
        </Field>
      </Card>

      <Card title="🧹 页面净化">
        <Toggle label="清理广告/推广元素" checked={settings.adClean} onChange={(v) => onToggle({ adClean: v })} />
      </Card>

      <Card title="⬇️ 下载 / 导出">
        <Toggle label="播放页显示「下载封面」按钮" checked={settings.coverDownload} onChange={(v) => onToggle({ coverDownload: v })} />
        <Toggle label="播放页显示「下载视频」按钮" checked={settings.videoDownload} onChange={(v) => onToggle({ videoDownload: v })} />
        <Toggle label="播放页显示「下载字幕」按钮" checked={settings.subtitleDownload} onChange={(v) => onToggle({ subtitleDownload: v })} />
        <Toggle label="播放页显示「导出弹幕」按钮" checked={settings.danmakuExport} onChange={(v) => onToggle({ danmakuExport: v })} />
        <p className="pk-stat-sub" style={{ margin: '4px 0 0' }}>
          这些按钮会在 B站<strong>视频播放页</strong>的视频信息区出现：封面走浏览器下载、视频为当前可用最高画质直链、
          字幕转 Srt、弹幕导出为 XML。跨域受限时自动降级（新标签打开 / 错误提示）并弹出 toast 反馈。
        </p>
      </Card>

      <Card title="▶️ 播放增强">
        <Toggle label="播放增强总开关" checked={settings.playerEnhance} onChange={(v) => onToggle({ playerEnhance: v })} />
        <Field label="自定义倍速">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={speedInput}
              onChange={(e) => setSpeedInput(e.target.value)}
              style={{ width: 140, verticalAlign: 'middle' }}
            />
            <span style={{ minWidth: 42, fontSize: 13 }}>{Number(speedInput).toFixed(2)}x</span>
            {[0.75, 1, 1.25, 1.5, 2].map((p) => (
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
            <button className="plugkit-btn" onClick={onSpeed} style={{ padding: '2px 10px', fontSize: 12 }}>应用</button>
            <span className="pk-stat-sub">0.5 – 3（手动输入可 0.1 – 16）</span>
          </div>
        </Field>
        <Toggle label="自动宽屏" checked={settings.autoWidescreen} onChange={(v) => onToggle({ autoWidescreen: v })} />
        <Toggle label="记忆播放进度" checked={settings.rememberProgress} onChange={(v) => onToggle({ rememberProgress: v })} />
        <Toggle label="自动播放（可能被浏览器策略拦截）" checked={settings.autoPlay} onChange={(v) => onToggle({ autoPlay: v })} />
        <Toggle label="显示视频清晰度/编码" checked={settings.showVideoInfo} onChange={(v) => onToggle({ showVideoInfo: v })} />
        <Toggle label="精确统计：播放/点赞等显示具体数字（替代「1.2万」模糊值）" checked={settings.preciseStats} onChange={(v) => onToggle({ preciseStats: v })} />
      </Card>

      <Card title="💬 弹幕管理">
        <Toggle label="弹幕管理（快捷键一键开关）" checked={settings.danmaku} onChange={(v) => onToggle({ danmaku: v })} />
        <Field label="弹幕快捷键">
          <HotkeyInput value={hotkeyInput} onChange={(v) => { setHotkeyInput(v); void onToggle({ danmakuHotkey: v }); }} />
          <span className="pk-stat-sub">点击输入框后按下组合键录制，失焦取消</span>
        </Field>
        <Field label="弹幕透明度">
          <input
            type="range"
            min={10}
            max={100}
            value={settings.danmakuOpacity}
            onChange={(e) => onToggle({ danmakuOpacity: Number(e.target.value) })}
            style={{ width: 160, verticalAlign: 'middle' }}
          />
          <span style={{ marginLeft: 8 }}>{settings.danmakuOpacity}%</span>
        </Field>
        <p className="pk-stat-sub" style={{ margin: '4px 0 0' }}>
          屏蔽词/字号过滤需拦截弹幕 protobuf 接口，本期后置；透明度对所有弹幕模式生效。
        </p>
      </Card>

      <Card title="👤 账号工具">
        <Toggle label="账号工具总开关" checked={settings.accountTools} onChange={(v) => onToggle({ accountTools: v })} />
        <Toggle label="每日自动签到（保守：仅签到，不投币/分享）" checked={settings.autoCheckin} onChange={(v) => onToggle({ autoCheckin: v })} />
        <Toggle label="播放页显示 UP 主属地" checked={settings.showOwnerLocation} onChange={(v) => onToggle({ showOwnerLocation: v })} />
        <Toggle label="播放页显示「复制封面」按钮" checked={settings.coverButton} onChange={(v) => onToggle({ coverButton: v })} />
        <Toggle label="播放页显示「复制标题链接」按钮" checked={settings.copyLinkButton} onChange={(v) => onToggle({ copyLinkButton: v })} />
      </Card>

      <Card title="📊 统计">
        <Field label="今日 PCDN 拦截">{stats.todayPcdn} 次（累计 {stats.totalPcdn}）</Field>
        <Field label="今日阻止上传">{fmtBytes(stats.todayP2pBytes)}（{stats.todayP2pCalls} 次）</Field>
        <Field label="今日清理广告">{stats.todayAdRemoved} 个元素（累计 {stats.totalAdRemoved}）</Field>
        <button className="plugkit-btn plugkit-btn-danger" onClick={onReset}>清零统计</button>
      </Card>

      <Card title="📖 使用说明">
        <Field label="快捷键">Alt + D：一键开关弹幕（需启用弹幕管理）；Alt + N：切换夜间模式（需启用夜间模式）。</Field>
        <Field label="播放页">视频页自动生效：UP 属地标签、复制封面/链接按钮、下载封面/视频/字幕/导出弹幕按钮、自定义倍速（设置后刷新页面）。</Field>
        <Field label="签到">开启「每日自动签到」后，每天定时执行一次（需后台在运行且已登录 B 站）。B 站接口不支持扩展页面直连（CORS），故不提供手动按钮。</Field>
        <Field label="统计口径">PCDN 拦截次数与阻止上传字节为精确值；估算省流量按「拦截次数 × 分片大小」推算，仅供参考。</Field>
      </Card>

      <p className="pk-stat-sub" style={{ marginTop: 16 }}>
        PCDN 拦截由浏览器内核(DNR)完成，零 JS 开销；激进档可能影响视频加载，如遇异常请关闭。
      </p>
    </OptionsPage>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
