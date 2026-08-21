import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, StatCard, SectionTitle, Badge } from '@plugkit/core/ui';
import {
  StateSnapshot,
  getStateChannel,
  checkinChannel,
  updateSettingsChannel,
  BiliSettings,
} from '../../shared/types';
import { fmtBytes } from '../../shared/format';

function App() {
  const [snap, setSnap] = React.useState<StateSnapshot | null>(null);
  const [error, setError] = React.useState('');
  const [checkin, setCheckin] = React.useState('');

  const reload = React.useCallback(async () => {
    try {
      // 加超时兜底：后台 Service Worker 冷启动/异常时不让界面永久"加载中"
      const snap = await Promise.race([
        getStateChannel.send(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('后台无响应（可能正在冷启动）。若持续出现，请到 chrome://extensions 刷新该插件后重试。')),
            4000,
          ),
        ),
      ]);
      setSnap(snap);
      setError('');
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

  const onCheckin = async () => {
    setCheckin('签到中…');
    const r = await checkinChannel.send();
    setCheckin(r.msg);
  };

  if (error) {
    return (
      <Popup>
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

  const { stats, settings } = snap;
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

      <SectionTitle>今日统计</SectionTitle>
      <StatCard
        label="PCDN 拦截（精确）"
        value={String(stats.todayPcdn)}
        sub={`累计 ${stats.totalPcdn} 次 · 估算省 ${snap.todayEstimatedMB} MB`}
      />
      <StatCard
        label="阻止上传（精确）"
        value={fmtBytes(stats.todayP2pBytes)}
        sub={`${stats.todayP2pCalls} 次调用 · 累计 ${fmtBytes(stats.totalP2pBytes)}`}
      />
      <StatCard
        label="清理广告（精确）"
        value={String(stats.todayAdRemoved)}
        sub={`累计 ${stats.totalAdRemoved} 个元素`}
      />

      <SectionTitle>功能开关</SectionTitle>
      <div className="plugkit-card" style={{ padding: '4px 14px' }}>
        <Toggle label="广告净化" checked={settings.adClean} onChange={(v) => onToggle({ adClean: v })} />
        <Toggle label="播放增强" checked={settings.playerEnhance} onChange={(v) => onToggle({ playerEnhance: v })} />
        <Toggle label="弹幕管理" checked={settings.danmaku} onChange={(v) => onToggle({ danmaku: v })} />
        <Toggle label="账号工具" checked={settings.accountTools} onChange={(v) => onToggle({ accountTools: v })} />
      </div>

      <SectionTitle>操作</SectionTitle>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="plugkit-btn plugkit-btn-primary" onClick={onCheckin}>
          立即签到
        </button>
        <button
          className="plugkit-btn"
          onClick={() => void browser.runtime.openOptionsPage()}
        >
          详细设置
        </button>
      </div>
      {checkin && <div className="pk-stat-sub" style={{ marginTop: 8 }}>{checkin}</div>}
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
