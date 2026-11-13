import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Popup, Toggle, Badge, Button } from '@plugkit/core/ui';
import { settingsStore, type HubSettings } from '../../shared/types';
import { discoverPlugins, setEnabledBulk, type ManagedPlugin } from '../../shared/discover';

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'on', label: '已启用' },
  { key: 'off', label: '已停用' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/** 插件卡片：插件中心风格，每个插件独立成卡 */
function PluginCard(props: {
  p: ManagedPlugin;
  onToggle: (enabled: boolean) => void;
  onOpen: () => void;
  onUninstall: () => void;
}) {
  const { p, onToggle, onOpen, onUninstall } = props;
  const [expanded, setExpanded] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const hasDetail = p.description || p.homepageUrl;
  return (
    <div className="plugkit-card" style={{ padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {p.iconUrl ? (
          <img src={p.iconUrl} width={34} height={34} style={{ borderRadius: 8, flexShrink: 0 }} alt="" />
        ) : (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--pk-accent-weak)',
              color: 'var(--pk-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            {p.displayName.slice(0, 1)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              title={p.displayName}
              style={{
                fontWeight: 600,
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {p.displayName}
            </span>
            <Badge tone="muted" style={{ flexShrink: 0 }}>v{p.version}</Badge>
          </div>
          <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Badge tone="accent">{p.category}</Badge>
            {p.isSelf && <Badge tone="success">本插件</Badge>}
          </div>
        </div>
        <span
          title={p.enabled ? '已启用' : '已停用'}
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: p.enabled ? 'var(--pk-success)' : 'var(--pk-text-muted)',
            flexShrink: 0,
          }}
        />
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {p.isSelf ? (
          <span style={{ fontSize: 12, color: 'var(--pk-success)', fontWeight: 600 }}>● 运行中</span>
        ) : (
          <Toggle label="启用" checked={p.enabled} onChange={onToggle} />
        )}
        {p.optionsUrl && (
          <Button onClick={onOpen} style={{ padding: '3px 10px', fontSize: 12 }}>
            {p.isSelf ? '设置' : '配置'}
          </Button>
        )}
        {!p.isSelf &&
          (confirming ? (
            <span style={{ fontSize: 12, color: 'var(--pk-danger)' }}>确认卸载？</span>
          ) : (
            <Button
              variant="danger"
              onClick={() => setConfirming(true)}
              style={{ padding: '3px 10px', fontSize: 12 }}
            >
              卸载
            </Button>
          ))}
        {confirming && !p.isSelf && (
          <>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                onUninstall();
              }}
              style={{ padding: '3px 10px', fontSize: 12 }}
            >
              确认
            </Button>
            <Button onClick={() => setConfirming(false)} style={{ padding: '3px 10px', fontSize: 12 }}>
              取消
            </Button>
          </>
        )}
        {hasDetail && (
          <Button
            onClick={() => setExpanded((v) => !v)}
            style={{ padding: '3px 10px', fontSize: 12, marginLeft: 'auto' }}
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
  );
}

function App() {
  const selfId = browser.runtime.id;
  const [plugins, setPlugins] = React.useState<ManagedPlugin[]>([]);
  const [settings, setSettings] = React.useState<HubSettings>(settingsStore.defaults);
  const [keyword, setKeyword] = React.useState('');
  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [error, setError] = React.useState('');
  /** 单次操作失败提示（批量/开关/卸载），与列表读取错误分开显示 */
  const [actionError, setActionError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      setPlugins(await discoverPlugins(selfId));
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
    try {
      await browser.management.setEnabled(p.id, enabled);
      setActionError('');
    } catch (e) {
      setActionError(`${p.displayName}：${String(e)}`);
    }
    await reload();
  };

  const onOpen = (p: ManagedPlugin) => {
    if (p.isSelf) {
      void browser.runtime.openOptionsPage();
    } else if (p.optionsUrl) {
      void browser.tabs.create({ url: p.optionsUrl });
    }
  };

  const onUninstall = async (p: ManagedPlugin) => {
    // 二次确认已在卡片内完成（confirm 在 MV3 popup 被禁用，UI 提供内联确认）
    try {
      await browser.management.uninstall(p.id);
      setActionError('');
    } catch (e) {
      setActionError(`${p.displayName}：${String(e)}`);
    }
    await reload();
  };

  /** 批量启用/停用：作用于当前筛选+搜索命中的插件（排除自身） */
  const onBulk = async (enabled: boolean) => {
    const targets = visible.filter((p) => !p.isSelf);
    if (targets.length === 0 || busy) return;
    setBusy(true);
    setActionError('');
    try {
      const { ok, failed } = await setEnabledBulk(targets, enabled);
      if (failed.length > 0) {
        setActionError(`${failed.length} 个失败：${failed[0].name}（${failed[0].err}）`);
      } else if (ok > 0) {
        setActionError('');
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const enabledCount = plugins.filter((p) => p.enabled).length;
  const kw = keyword.trim().toLowerCase();
  const visible = plugins.filter((p) => {
    if (!settings.showSelf && p.isSelf) return false;
    if (filter === 'on' && !p.enabled) return false;
    if (filter === 'off' && p.enabled) return false;
    if (!kw) return true;
    return (
      p.displayName.toLowerCase().includes(kw) ||
      p.name.toLowerCase().includes(kw) ||
      p.id.toLowerCase().includes(kw)
    );
  });
  const bulkTargets = visible.filter((p) => !p.isSelf);

  return (
    <Popup>
      <div className="plugkit-popup-header">
        <img src={chrome.runtime.getURL('icons/48.png')} width={28} height={28} style={{ borderRadius: 6 }} alt="" />
        <h3 style={{ flex: 1 }}>插件平台</h3>
        <Badge tone={plugins.length > 0 ? 'accent' : 'muted'}>
          {plugins.length > 0 ? `${enabledCount}/${plugins.length} 启用` : '无插件'}
        </Badge>
      </div>

      {/* 概览条：插件总数 / 启用数一目了然 */}
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          borderRadius: 8,
          background: 'var(--pk-accent-weak)',
          border: '1px solid var(--pk-accent)',
          display: 'flex',
          justifyContent: 'space-around',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--pk-accent)' }}>{plugins.length}</div>
          <div style={{ fontSize: 11, color: 'var(--pk-text-secondary)' }}>插件总数</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--pk-success)' }}>{enabledCount}</div>
          <div style={{ fontSize: 11, color: 'var(--pk-text-secondary)' }}>已启用</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--pk-text)' }}>{plugins.length - enabledCount}</div>
          <div style={{ fontSize: 11, color: 'var(--pk-text-secondary)' }}>已停用</div>
        </div>
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

          {/* 状态筛选 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {FILTERS.map((f) => {
              const count =
                f.key === 'all' ? plugins.length : f.key === 'on' ? enabledCount : plugins.length - enabledCount;
              const active = filter === f.key;
              return (
                <Button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '4px 8px',
                    fontSize: 12,
                    ...(active
                      ? {
                          borderColor: 'var(--pk-accent)',
                          color: 'var(--pk-accent)',
                          background: 'var(--pk-accent-weak)',
                          fontWeight: 600,
                        }
                      : null),
                  }}
                >
                  {f.label} {count}
                </Button>
              );
            })}
          </div>

          {/* 批量开关：只作用于当前命中的插件，自身不参与 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <Button
              onClick={() => void onBulk(true)}
              disabled={busy || bulkTargets.every((p) => p.enabled)}
              style={{ flex: 1, justifyContent: 'center', padding: '4px 8px', fontSize: 12 }}
            >
              启用全部
            </Button>
            <Button
              onClick={() => void onBulk(false)}
              disabled={busy || bulkTargets.every((p) => !p.enabled)}
              style={{ flex: 1, justifyContent: 'center', padding: '4px 8px', fontSize: 12 }}
            >
              停用全部
            </Button>
          </div>

          {actionError && (
            <div
              style={{
                marginTop: 8,
                padding: '4px 10px',
                borderRadius: 8,
                background: 'var(--pk-danger-weak)',
                border: '1px solid var(--pk-danger)',
                color: 'var(--pk-danger)',
                fontSize: 11,
                wordBreak: 'break-all',
              }}
            >
              {actionError}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            {visible.map((p) => (
              <PluginCard
                key={p.id}
                p={p}
                onToggle={(v) => void onToggle(p, v)}
                onOpen={() => onOpen(p)}
                onUninstall={() => void onUninstall(p)}
              />
            ))}
            {visible.length === 0 && (
              <div className="pk-stat-sub" style={{ padding: '12px 0', textAlign: 'center' }}>
                无匹配结果
              </div>
            )}
          </div>
        </>
      )}
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
