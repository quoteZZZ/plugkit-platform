import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, StatCard, SectionTitle, Badge, Button } from '@plugkit/core/ui';
import {
  StateSnapshot,
  getStateChannel,
  checkinChannel,
  setMasterChannel,
  updateSettingsChannel,
  BiliSettings,
  DayStat,
} from '../../shared/types';
import { fmtBytes } from '../../shared/format';

/** 近 7 天 PCDN 拦截迷你柱状图 */
function TrendChart({ daily }: { daily: DayStat[] }) {
  const max = Math.max(...daily.map((d) => d.pcdn), 1);
  return (
    <div className="plugkit-card pk-stat">
      <div className="pk-stat-label">近7天拦截趋势（PCDN 次数）</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, marginTop: 10 }}>
        {daily.map((d) => {
          const ratio = d.pcdn / max;
          const h = Math.max(4, Math.round(ratio * 46));
          return (
            <div
              key={d.date}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
            >
              <div
                title={`${d.date}: ${d.pcdn} 次`}
                style={{
                  width: '100%',
                  borderRadius: 3,
                  background: 'var(--pk-accent)',
                  opacity: 0.4 + 0.6 * ratio,
                  height: h,
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--pk-text-muted)' }}>{d.date.slice(5)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      // 后台异常时 sendMessage 可能 resolve undefined，须显式校验，避免永久"加载中"
      if (!snap || !snap.settings || !snap.stats) {
        throw new Error('后台返回异常（疑似旧版本数据）。请到 chrome://extensions 刷新该插件后重试。');
      }
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

  const onToggleMaster = async (v: boolean) => {
    // 总开关走专用通道，确保 DNR 规则集同步启停
    await setMasterChannel.send({ on: v });
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
          <Button variant="primary" style={{ marginTop: 10 }} onClick={() => void reload()}>
            重试
          </Button>
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

      <SectionTitle>拦截总开关</SectionTitle>
      <div className="plugkit-card" style={{ padding: '2px 14px' }}>
        <Toggle
          label="PCDN / 上传拦截"
          checked={settings.masterOn}
          onChange={onToggleMaster}
        />
        <p className="pk-stat-sub" style={{ margin: '2px 0 8px' }}>
          {settings.masterOn
            ? `已启用 · 档位：${settings.aggressive ? '激进' : '标准'}（详设中可切换）`
            : '已停用，视频走原始 CDN（网页净化等其余功能不受影响）'}
        </p>
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

      {stats.daily.length > 0 && <TrendChart daily={stats.daily} />}

      <SectionTitle>功能开关</SectionTitle>
      <div className="plugkit-card" style={{ padding: '4px 14px' }}>
        <Toggle label="广告净化" checked={settings.adClean} onChange={(v) => onToggle({ adClean: v })} />
        <Toggle label="播放增强" checked={settings.playerEnhance} onChange={(v) => onToggle({ playerEnhance: v })} />
        <Toggle label="弹幕管理" checked={settings.danmaku} onChange={(v) => onToggle({ danmaku: v })} />
        <Toggle label="账号工具" checked={settings.accountTools} onChange={(v) => onToggle({ accountTools: v })} />
      </div>

      <SectionTitle>操作</SectionTitle>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={onCheckin}>
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
