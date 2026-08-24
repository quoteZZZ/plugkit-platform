import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import {
  Popup,
  SectionTitle,
  StatCard,
  Badge,
  Button,
  ChipToggle,
  useChromeStorage,
} from '@plugkit/core/ui';
import { defineChannel } from '@plugkit/core/messaging';
import { createLogger, getLogs, clearLogs, PLUGKIT_STATUS_CHANNEL } from '@plugkit/core';
import { getActiveTab } from '@plugkit/core/platform';

const logger = createLogger('popup');

// 与 background 中同名通道对应：popup → 后台
const ping = defineChannel<void, { pong: true; time: number }>('PING');
// 与 content 中同名通道对应：popup → 指定 tab 的 content
const getTitle = defineChannel<void, string>('GET_TITLE');

// 用基座的 useChromeStorage 直接读写 storage 键（与 bilibili 同款模式）
interface StarterSettings {
  enabled: boolean;
  showBadge: boolean;
  autoPing: boolean;
}
const SETTINGS_DEFAULT: StarterSettings = { enabled: true, showBadge: true, autoPing: false };
const SETTINGS_KEY = 'plugkit:starter:settings';

function App() {
  const [settings, updateSettings, loading] = useChromeStorage<StarterSettings>(
    SETTINGS_KEY,
    SETTINGS_DEFAULT,
  );
  const [title, setTitle] = React.useState('…');
  const [url, setUrl] = React.useState('…');
  const [resp, setResp] = React.useState('');
  const [logCount, setLogCount] = React.useState<number | null>(null);
  const [lastPing, setLastPing] = React.useState<number | null>(null);

  // 读当前页信息 + 后台日志条数（演示 platform / 跨插件桥接）
  React.useEffect(() => {
    void (async () => {
      const tab = await getActiveTab();
      setTitle(tab?.title ?? '');
      setUrl(tab?.url ?? '');
      try {
        const status = await browser.runtime.sendMessage(PLUGKIT_STATUS_CHANNEL, {});
        if (status?.logs) setLogCount(status.logs.length);
      } catch {
        /* 后台未响应时静默 */
      }
    })();
  }, []);

  const copy = async () => {
    const text = `${title}\n${url}`;
    await navigator.clipboard.writeText(text);
    logger.info('已复制', text);
    setResp('已复制 ✓');
  };

  const doPing = async () => {
    const r = await ping.send();
    setLastPing(r.time);
    setResp('后台回复: ' + JSON.stringify(r));
  };

  const fromPage = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    const t = await getTitle.send({ tabId: tab.id });
    setResp('页面标题: ' + t);
  };

  const refreshLogs = async () => {
    const logs = await getLogs();
    setLogCount(logs.length);
    setResp(`后台日志 ${logs.length} 条`);
  };

  const clearAllLogs = async () => {
    await clearLogs();
    setLogCount(0);
    setResp('日志已清空');
  };

  if (loading) {
    return (
      <Popup>
        <div className="plugkit-card">
          <div className="pk-stat-label">加载中</div>
          <div className="pk-stat-value" style={{ fontSize: 14 }}>…</div>
        </div>
      </Popup>
    );
  }

  return (
    <Popup>
      {/* 顶部状态条：与 bilibili / manager 一致 */}
      <div className="plugkit-popup-header">
        <img src={chrome.runtime.getURL('icons/48.png')} width={28} height={28} style={{ borderRadius: 6 }} alt="" />
        <h3 style={{ flex: 1 }}>示例插件</h3>
        <Badge tone={settings.enabled ? 'success' : 'muted'}>
          {settings.enabled ? '运行中' : '已停用'}
        </Badge>
      </div>

      {/* 概览条：用基座 StatCard 展示状态，无需手写样式 */}
      <div className="plugkit-grid-3">
        <StatCard label="后台日志" value={logCount === null ? '…' : String(logCount)} sub="点击刷新" />
        <StatCard label="最近 Ping" value={lastPing ? new Date(lastPing).toLocaleTimeString() : '—'} sub="与后台通道" />
        <StatCard label="当前页" value={title && title !== '…' ? '已读取' : '—'} sub="platform API" />
      </div>

      {/* 核心开关：用 ChipToggle 紧凑并排（bilibili 同款） */}
      <SectionTitle>功能</SectionTitle>
      <div className="plugkit-card" style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <ChipToggle
          label="启用"
          checked={settings.enabled}
          onChange={(v) => void updateSettings({ enabled: v })}
        />
        <ChipToggle
          label="角标"
          checked={settings.showBadge}
          onChange={(v) => void updateSettings({ showBadge: v })}
        />
        <ChipToggle
          label="自动 Ping"
          checked={settings.autoPing}
          onChange={(v) => void updateSettings({ autoPing: v })}
        />
      </div>

      {/* 消息/平台能力演示 */}
      <SectionTitle>能力演示</SectionTitle>
      <div className="plugkit-card">
        <div className="pk-stat-sub" style={{ marginBottom: 8, wordBreak: 'break-all' }}>
          <b>当前页</b> · {title || '—'}
          <br />
          {url || '—'}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={copy}>复制标题与 URL</Button>
          <Button onClick={doPing}>Ping 后台</Button>
          <Button onClick={fromPage}>取页面标题</Button>
          <Button onClick={() => void refreshLogs()}>刷新日志</Button>
          <Button variant="danger" onClick={() => void clearAllLogs()}>清空日志</Button>
        </div>
      </div>

      {resp && (
        <p className="pk-stat-sub" style={{ margin: '8px 0 0' }}>{resp}</p>
      )}

      {/* 底部：跳设置页（MV3 不用 confirm，直接跳转） */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button style={{ flex: 1 }} onClick={() => void browser.tabs.create({ url: 'https://www.bilibili.com/' })}>
          打开示例站
        </Button>
        <Button style={{ flex: 1 }} onClick={() => void browser.runtime.openOptionsPage()}>
          详细设置
        </Button>
      </div>
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
