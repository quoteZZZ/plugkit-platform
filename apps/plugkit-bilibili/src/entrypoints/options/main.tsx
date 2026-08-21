import React from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsPage, Field, Toggle, SectionTitle } from '@plugkit/core/ui';
import {
  StateSnapshot,
  getStateChannel,
  updateSettingsChannel,
  resetStatsChannel,
  BiliSettings,
} from '../../shared/types';
import { fmtBytes } from '../../shared/format';

function Group(props: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SectionTitle>{props.title}</SectionTitle>
      <div className="plugkit-card" style={{ padding: '8px 16px' }}>
        {props.children}
      </div>
    </>
  );
}

function App() {
  const [snap, setSnap] = React.useState<StateSnapshot | null>(null);
  const [error, setError] = React.useState('');
  const [chunkInput, setChunkInput] = React.useState('2');
  const [speedInput, setSpeedInput] = React.useState('1');
  const [hotkeyInput, setHotkeyInput] = React.useState('Alt+D');

  const reload = React.useCallback(async () => {
    try {
      const s = await Promise.race([
        getStateChannel.send(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('后台无响应，请到 chrome://extensions 刷新该插件后重试。')), 4000),
        ),
      ]);
      setSnap(s);
      setError('');
      setChunkInput(String(s.settings.avgChunkMB));
      setSpeedInput(String(s.settings.customSpeed));
      setHotkeyInput(s.settings.danmakuHotkey);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const onToggle = async (patch: Partial<BiliSettings>) => {
    await updateSettingsChannel.send({ patch });
    await reload();
  };
  const onReset = async () => {
    if (confirm('确定清零全部统计？')) {
      await resetStatsChannel.send();
      await reload();
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
  const onHotkey = async () => {
    const v = hotkeyInput.trim();
    if (v) await onToggle({ danmakuHotkey: v });
  };

  if (!snap) {
    return (
      <OptionsPage title="B站管理 · 设置">
        {error ? (
          <div className="plugkit-card">
            <div className="pk-stat-label">错误</div>
            <div className="pk-stat-value" style={{ fontSize: 14 }}>{error}</div>
            <button
              className="plugkit-btn plugkit-btn-primary"
              style={{ marginTop: 10 }}
              onClick={() => void reload()}
            >
              重试
            </button>
          </div>
        ) : (
          '加载中…'
        )}
      </OptionsPage>
    );
  }
  const { stats, settings } = snap;

  return (
    <OptionsPage title="B站管理 · 设置">
      <p className="subtitle">拦截资源占用、净化页面、增强播放、管理弹幕、账号工具——全部开关与参数。</p>

      <Group title="🛡 拦截">
        <Toggle label="PCDN 域名拦截" checked={settings.masterOn} onChange={(v) => onToggle({ masterOn: v })} />
        <Toggle label="激进档：全部 *.bilivideo.cn 等（慎开）" checked={settings.aggressive} onChange={(v) => onToggle({ aggressive: v })} />
        <Toggle label="阻止直播 WebRTC(P2P) 上传" checked={settings.blockP2p} onChange={(v) => onToggle({ blockP2p: v })} />
        <Field label="估算分片 (MB)">
          <input className="plugkit-input" type="number" value={chunkInput} onChange={(e) => setChunkInput(e.target.value)} style={{ width: 80 }} />
          <button className="plugkit-btn" onClick={onChunk} style={{ marginLeft: 8 }}>保存</button>
        </Field>
      </Group>

      <Group title="🧹 页面净化">
        <Toggle label="清理广告/推广元素" checked={settings.adClean} onChange={(v) => onToggle({ adClean: v })} />
      </Group>

      <Group title="▶️ 播放增强">
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
            <button className="plugkit-btn" onClick={onSpeed} style={{ padding: '2px 10px', fontSize: 12 }}>
              应用
            </button>
            <span className="pk-stat-sub">0.5 – 3（手动输入可 0.1 – 16）</span>
          </div>
        </Field>
        <Toggle label="自动宽屏" checked={settings.autoWidescreen} onChange={(v) => onToggle({ autoWidescreen: v })} />
        <Toggle label="记忆播放进度" checked={settings.rememberProgress} onChange={(v) => onToggle({ rememberProgress: v })} />
        <Toggle label="自动播放（可能被浏览器策略拦截）" checked={settings.autoPlay} onChange={(v) => onToggle({ autoPlay: v })} />
      </Group>

      <Group title="💬 弹幕管理">
        <Toggle label="弹幕管理（快捷键一键开关）" checked={settings.danmaku} onChange={(v) => onToggle({ danmaku: v })} />
        <Field label="弹幕快捷键">
          <input
            className="plugkit-input"
            value={hotkeyInput}
            onChange={(e) => setHotkeyInput(e.target.value)}
            onBlur={() => void onHotkey()}
            style={{ width: 130 }}
            placeholder="Alt+D"
          />
          <button className="plugkit-btn" onClick={() => void onHotkey()} style={{ marginLeft: 8 }}>
            保存
          </button>
          <span className="pk-stat-sub">格式：Ctrl/Alt/Shift+按键，失焦或保存生效</span>
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
      </Group>

      <Group title="👤 账号工具">
        <Toggle label="账号工具总开关" checked={settings.accountTools} onChange={(v) => onToggle({ accountTools: v })} />
        <Toggle label="每日自动签到（保守：仅签到，不投币/分享）" checked={settings.autoCheckin} onChange={(v) => onToggle({ autoCheckin: v })} />
        <Toggle label="播放页显示 UP 主属地" checked={settings.showOwnerLocation} onChange={(v) => onToggle({ showOwnerLocation: v })} />
        <Toggle label="播放页显示「复制封面」按钮" checked={settings.coverButton} onChange={(v) => onToggle({ coverButton: v })} />
      </Group>

      <Group title="📊 统计">
        <Field label="今日 PCDN 拦截">{stats.todayPcdn} 次（累计 {stats.totalPcdn}）</Field>
        <Field label="今日阻止上传">{fmtBytes(stats.todayP2pBytes)}（{stats.todayP2pCalls} 次）</Field>
        <Field label="今日清理广告">{stats.todayAdRemoved} 个元素（累计 {stats.totalAdRemoved}）</Field>
        <button className="plugkit-btn plugkit-btn-danger" onClick={onReset}>清零统计</button>
      </Group>

      <Group title="📖 使用说明">
        <Field label="快捷键">Alt + D：一键开关弹幕（需启用弹幕管理）</Field>
        <Field label="播放页">视频页自动生效：UP 属地标签、复制封面按钮、自定义倍速（设置后刷新页面）。</Field>
        <Field label="签到">popup 点「立即签到」即时执行；开启自动签到后每天定时执行一次（需浏览器在运行且已登录 B 站）。</Field>
        <Field label="统计口径">PCDN 拦截次数与阻止上传字节为精确值；估算省流量按「拦截次数 × 分片大小」推算，仅供参考。</Field>
        <Field label="后置功能">视频下载、弹幕屏蔽词/字号（需接口级过滤）规划中，暂未提供。</Field>
      </Group>

      <p className="pk-stat-sub" style={{ marginTop: 16 }}>
        PCDN 拦截由浏览器内核(DNR)完成，零 JS 开销；激进档可能影响视频加载，如遇异常请关闭。
      </p>
    </OptionsPage>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
