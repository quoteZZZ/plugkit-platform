import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, Badge, Button } from '@plugkit/core/ui';
import { settingsStore, type HubSettings } from '../../shared/types';

interface ManagedPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  iconUrl?: string;
  optionsUrl?: string;
  displayName?: string;
  category?: string;
  description?: string;
  homepageUrl?: string;
  isSelf: boolean;
}

function PluginRow(props: {
  p: ManagedPlugin;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
  onUninstall: () => void;
}) {
  const { p, onToggle, onOpen, onUninstall } = props;
  const [expanded, setExpanded] = React.useState(false);
  const hasDetail = p.description || p.homepageUrl;
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 0',
        borderBottom: '1px solid #eaeef2',
      }}
    >
      {p.iconUrl ? (
        <img src={p.iconUrl} width={32} height={32} style={{ borderRadius: 8, flexShrink: 0 }} alt="" />
      ) : (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: '#ddf4ff',
            color: '#1f6feb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {(p.displayName ?? p.name).slice(0, 1)}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{p.displayName ?? p.name}</span>
          <Badge tone="muted">v{p.version}</Badge>
          <Badge tone="accent">{p.category ?? 'PlugKit'}</Badge>
          {p.isSelf && <Badge tone="success">本插件</Badge>}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          {p.isSelf ? (
            <span style={{ fontSize: 12, color: '#8c959f' }}>正在运行</span>
          ) : (
            <Toggle label="启用" checked={p.enabled} onChange={onToggle} />
          )}
          {p.optionsUrl && (
            <Button onClick={onOpen} style={{ padding: '3px 10px', fontSize: 12 }}>
              {p.isSelf ? '设置' : '配置'}
            </Button>
          )}
          {!p.isSelf && (
            <Button variant="danger" onClick={onUninstall} style={{ padding: '3px 10px', fontSize: 12 }}>
              卸载
            </Button>
          )}
          {hasDetail && (
            <Button
              onClick={() => setExpanded((v) => !v)}
              style={{ padding: '3px 10px', fontSize: 12 }}
            >
              {expanded ? '收起 ▲' : '详情 ▼'}
            </Button>
          )}
        </div>

        {expanded && hasDetail && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'var(--pk-bg)',
              fontSize: 12,
              color: 'var(--pk-text-secondary)',
              lineHeight: 1.7,
              wordBreak: 'break-all',
            }}
          >
            {p.description && <div>{p.description}</div>}
            <div style={{ marginTop: 4, color: 'var(--pk-text-muted)' }}>扩展 ID：{p.id}</div>
            {p.homepageUrl && (
              <div>
                主页：
                <a href={p.homepageUrl} target="_blank" rel="noreferrer">
                  {p.homepageUrl}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const selfId = browser.runtime.id;
  const [plugins, setPlugins] = React.useState<ManagedPlugin[]>([]);
  const [settings, setSettings] = React.useState<HubSettings>(settingsStore.defaults);
  const [keyword, setKeyword] = React.useState('');
  const [error, setError] = React.useState('');

  const reload = React.useCallback(async () => {
    try {
      const all = await browser.management.getAll();
      // 识别：Chrome 的 management API 会剥离 manifest 自定义字段（plugkit 读不到），
      // 因此用标准字段 name 前缀兜底——PlugKit 系列插件 name 均以 "PlugKit" 开头
      const managed: ManagedPlugin[] = (all as any[])
        .filter(
          (e: any) =>
            e.manifest?.plugkit?.suite === 'plugkit' ||
            (typeof e.name === 'string' && e.name.startsWith('PlugKit')),
        )
        .map((e: any) => ({
          id: e.id,
          name: e.name,
          version: e.version,
          enabled: e.enabled,
          iconUrl: e.icons?.[e.icons.length - 1]?.url,
          optionsUrl: e.optionsUrl,
          displayName: e.manifest?.plugkit?.displayName ?? e.name,
          category: e.manifest?.plugkit?.category ?? 'PlugKit',
          description: e.description,
          homepageUrl: e.homepageUrl,
          isSelf: e.id === selfId,
        }))
        // 排序：本平台（自身）置顶，其余按显示名
        .sort((a, b) => {
          if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
          return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name);
        });
      setPlugins(managed);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }, [selfId]);

  const loadSettings = React.useCallback(async () => {
    setSettings(await settingsStore.get());
  }, []);

  React.useEffect(() => {
    void reload();
    void loadSettings();
  }, [reload, loadSettings]);

  // 自动刷新列表（按设置）
  React.useEffect(() => {
    if (!settings.autoRefresh) return;
    const t = setInterval(() => void reload(), Math.max(2, settings.refreshSeconds) * 1000);
    return () => clearInterval(t);
  }, [settings.autoRefresh, settings.refreshSeconds, reload]);

  const onToggle = async (p: ManagedPlugin, enabled: boolean) => {
    await browser.management.setEnabled(p.id, enabled);
    reload();
  };
  const onOpen = (p: ManagedPlugin) => {
    if (p.isSelf) {
      void browser.runtime.openOptionsPage();
    } else if (p.optionsUrl) {
      void browser.tabs.create({ url: p.optionsUrl });
    }
  };
  const onUninstall = async (p: ManagedPlugin) => {
    if (confirm(`确定卸载「${p.displayName ?? p.name}」？此操作不可撤销。`)) {
      await browser.management.uninstall(p.id);
      reload();
    }
  };

  const kw = keyword.trim().toLowerCase();
  const visible = plugins.filter((p) => {
    if (!settings.showSelf && p.isSelf) return false;
    if (!kw) return true;
    return (
      (p.displayName ?? p.name).toLowerCase().includes(kw) ||
      (p.name ?? '').toLowerCase().includes(kw)
    );
  });
  const enabledCount = plugins.filter((p) => p.enabled).length;

  return (
    <Popup>
      <div className="plugkit-popup-header">
        <img src={chrome.runtime.getURL('icons/48.png')} width={28} height={28} style={{ borderRadius: 6 }} alt="" />
        <h3 style={{ flex: 1 }}>插件平台</h3>
        <Badge tone={plugins.length > 0 ? 'accent' : 'muted'}>
          {plugins.length > 0 ? `${enabledCount}/${plugins.length} 启用` : '无插件'}
        </Badge>
      </div>

      {error && (
        <div className="plugkit-card" style={{ marginTop: 10 }}>
          <div className="pk-stat-label">错误</div>
          <div className="pk-stat-value" style={{ fontSize: 13 }}>{error}</div>
        </div>
      )}

      {!error && plugins.length === 0 && (
        <div className="plugkit-card" style={{ marginTop: 10 }}>
          <div className="pk-stat-label">未发现 PlugKit 系列插件</div>
          <p style={{ fontSize: 12, color: '#57606a', lineHeight: 1.7, margin: '6px 0 0' }}>
            系列插件（名称以 PlugKit 开头，或 manifest 含 plugkit.suite="plugkit"）安装后会自动出现在这里。
            用 <code>pnpm create-plugkit</code> 生成的新插件即自动接入。
          </p>
        </div>
      )}

      {plugins.length > 0 && (
        <>
          <input
            className="plugkit-search"
            placeholder="搜索插件…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ marginTop: 10 }}
          />
          <div>
            {visible.map((p) => (
              <PluginRow
                key={p.id}
                p={p}
                onToggle={(v) => onToggle(p, v)}
                onOpen={() => onOpen(p)}
                onUninstall={() => onUninstall(p)}
              />
            ))}
            {visible.length === 0 && (
              <div className="pk-stat-sub" style={{ padding: '12px 0' }}>
                没有匹配「{keyword}」的插件
              </div>
            )}
          </div>
        </>
      )}

      <p className="pk-stat-sub" style={{ marginTop: 10, textAlign: 'center' }}>
        卸载不可逆 · 详情见设置页
      </p>
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
