import React from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { OptionsPage, Field, Toggle, SectionTitle } from '@plugkit/core/ui';
import type { LogEntry, LogLevel } from '@plugkit/core';
import { LogPanel } from '../../components/LogPanel';
import { settingsStore, type HubSettings } from '../../shared/types';
import { fetchLogs, clearLogsFor } from '../../shared/hub';

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

interface ManagedPlugin {
  id: string;
  name: string;
  displayName?: string;
  isSelf: boolean;
}

function App() {
  const selfId = browser.runtime.id;
  const [settings, setSettings] = React.useState<HubSettings>(settingsStore.defaults);
  const [plugins, setPlugins] = React.useState<ManagedPlugin[]>([]);
  const [refreshInput, setRefreshInput] = React.useState('');
  const [maxLogsInput, setMaxLogsInput] = React.useState('');

  // 日志监测状态
  const [logTarget, setLogTarget] = React.useState<string>('');
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = React.useState(false);
  const [logsReachable, setLogsReachable] = React.useState(true);

  const load = React.useCallback(async () => {
    const s = await settingsStore.get();
    setSettings(s);
    setRefreshInput(String(s.refreshSeconds));
    setMaxLogsInput(String(s.maxLogs));

    const all = await browser.management.getAll();
    const managed: ManagedPlugin[] = (all as any[])
      .filter(
        (e: any) =>
          e.manifest?.plugkit?.suite === 'plugkit' ||
          (typeof e.name === 'string' && e.name.startsWith('PlugKit')),
      )
      .map((e: any) => ({
        id: e.id,
        name: e.name,
        displayName: e.manifest?.plugkit?.displayName ?? e.name,
        isSelf: e.id === selfId,
      }))
      // 排序：本平台（自身）置顶，其余按显示名
      .sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
        return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name);
      });
    setPlugins(managed);
    setLogTarget((prev) => prev || managed[0]?.id || '');
  }, [selfId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const update = React.useCallback(async (patch: Partial<HubSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    await settingsStore.set(patch);
  }, []);

  const refreshLogs = React.useCallback(
    async (targetId: string) => {
      if (!targetId) return;
      setLogsLoading(true);
      try {
        const { logs: list, reachable } = await fetchLogs(targetId, selfId);
        setLogs(list.slice(-settings.maxLogs));
        setLogsReachable(reachable);
      } finally {
        setLogsLoading(false);
      }
    },
    [selfId, settings.maxLogs],
  );

  React.useEffect(() => {
    if (logTarget && settings.logMonitor) void refreshLogs(logTarget);
  }, [logTarget, settings.logMonitor, refreshLogs]);

  // 实时日志轮询自动刷新（与 popup 一致，按刷新间隔持续拉取）
  React.useEffect(() => {
    if (!logTarget || !settings.logMonitor) return;
    const t = setInterval(
      () => void refreshLogs(logTarget),
      Math.max(2, settings.refreshSeconds) * 1000,
    );
    return () => clearInterval(t);
  }, [logTarget, settings.logMonitor, settings.refreshSeconds, refreshLogs]);

  const onRefreshSeconds = async () => {
    const v = parseInt(refreshInput, 10);
    if (Number.isFinite(v) && v >= 2) await update({ refreshSeconds: v });
    else {
      setRefreshInput(String(settings.refreshSeconds));
      alert('刷新间隔需 ≥ 2 秒');
    }
  };

  const onMaxLogs = async () => {
    const v = parseInt(maxLogsInput, 10);
    if (Number.isFinite(v) && v >= 10) await update({ maxLogs: v });
    else {
      setMaxLogsInput(String(settings.maxLogs));
      alert('日志条数需 ≥ 10');
    }
  };

  const logTargets = plugins.filter((p) => (settings.showSelf ? true : !p.isSelf));

  return (
    <OptionsPage title="插件平台 · 设置">
      <p className="subtitle">
        集中管理 PlugKit 系列插件：列表总览、开关、日志监测——以下为插件平台自身的偏好设置。
      </p>

      <Group title="⚙️ 列表与刷新">
        <Toggle
          label="列表中显示自身（管理平台）"
          checked={settings.showSelf}
          onChange={(v) => update({ showSelf: v })}
        />
        <Toggle
          label="自动刷新插件列表"
          checked={settings.autoRefresh}
          onChange={(v) => update({ autoRefresh: v })}
        />
        <Field label="刷新间隔（秒）">
          <input
            className="plugkit-input"
            type="number"
            min={2}
            value={refreshInput}
            onChange={(e) => setRefreshInput(e.target.value)}
            onBlur={onRefreshSeconds}
            style={{ width: 80 }}
          />
          <span className="pk-stat-sub" style={{ marginLeft: 8 }}>≥ 2 秒，回车或失焦生效</span>
        </Field>
      </Group>

      <Group title="📋 日志监测">
        <Toggle
          label="启用日志监测"
          checked={settings.logMonitor}
          onChange={(v) => update({ logMonitor: v })}
        />
        <Field label="日志条数上限">
          <input
            className="plugkit-input"
            type="number"
            min={10}
            value={maxLogsInput}
            onChange={(e) => setMaxLogsInput(e.target.value)}
            onBlur={onMaxLogs}
            style={{ width: 80 }}
          />
          <span className="pk-stat-sub" style={{ marginLeft: 8 }}>每插件展示条数（≥ 10）</span>
        </Field>
        <Field label="最低级别">
          <select
            className="plugkit-input"
            value={settings.minLogLevel}
            onChange={(e) => update({ minLogLevel: e.target.value as LogLevel })}
          >
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </Field>
      </Group>

      <Group title="🖥 运行状态与日志">
        {settings.logMonitor ? (
          <>
            <Field label="插件">
              <select
                className="plugkit-input"
                value={logTarget}
                onChange={(e) => setLogTarget(e.target.value)}
                style={{ width: '100%' }}
              >
                {logTargets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName ?? p.name}
                    {p.isSelf ? '（本插件）' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {!logsReachable && (
              <div
                className="plugkit-card"
                style={{
                  marginBottom: 8,
                  background: 'var(--pk-danger-weak)',
                  borderColor: 'var(--pk-danger)',
                  padding: '8px 12px',
                }}
              >
                <div className="pk-stat-label" style={{ color: 'var(--pk-danger)' }}>
                  ⚠ 该插件后台不可达
                </div>
                <p className="pk-stat-sub" style={{ marginTop: 2 }}>
                  无法读取其日志：插件 Service Worker 未运行或消息通道异常。请到 chrome://extensions
                  刷新该插件后重试。
                </p>
              </div>
            )}
            <LogPanel
              logs={logs}
              loading={logsLoading}
              minLevel={settings.minLogLevel}
              onMinLevel={(l: LogLevel) => update({ minLogLevel: l })}
              onRefresh={() => void refreshLogs(logTarget)}
              onClear={() => void clearLogsFor(logTarget, selfId).then(() => refreshLogs(logTarget))}
            />
            <p className="pk-stat-sub" style={{ margin: '8px 0 0' }}>
              「本插件」为该插件平台自身日志（始终可读）；其他插件需后台运行且支持跨插件协议，否则显示不可达。
            </p>
          </>
        ) : (
          <p className="pk-stat-sub">日志监测已关闭，可在上方「日志监测」分组开启。</p>
        )}
      </Group>

      <Group title="📖 说明">
        <Field label="识别规则">
          只有 manifest 含 <code>plugkit.suite = "plugkit"</code>（或名称以 PlugKit 开头）的扩展会被列出。
        </Field>
        <Field label="自身管理">
          管理平台自身不提供启用/卸载入口（无法自管理）；本页面即其配置页。
        </Field>
        <Field label="所需权限">management（读取与开关扩展）、storage。</Field>
      </Group>
    </OptionsPage>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
