import React from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsPage, Card, Field, Toggle, SectionTitle } from '@plugkit/core/ui';
import { useChromeStorage } from '@plugkit/core/ui';

interface StarterSettings {
  enabled: boolean;
  showBadge: boolean;
  autoPing: boolean;
  note: string;
}
const SETTINGS_DEFAULT: StarterSettings = {
  enabled: true,
  showBadge: true,
  autoPing: false,
  note: '',
};
const SETTINGS_KEY = 'plugkit:starter:settings';

function App() {
  const [settings, updateSettings] = useChromeStorage<StarterSettings>(
    SETTINGS_KEY,
    SETTINGS_DEFAULT,
  );

  return (
    <OptionsPage title="示例插件 · 设置">
      <p className="subtitle">
        这是基于 PlugKit 基座的示例设置页。所有控件直接读写 storage，
        后台 / 弹窗实时同步（无需手动保存）。
      </p>

      <Card title="⚙️ 基础">
        <Toggle
          label="启用功能"
          checked={settings.enabled}
          onChange={(v) => void updateSettings({ enabled: v })}
        />
        <Toggle
          label="显示角标"
          checked={settings.showBadge}
          onChange={(v) => void updateSettings({ showBadge: v })}
        />
        <Toggle
          label="自动 Ping 后台"
          checked={settings.autoPing}
          onChange={(v) => void updateSettings({ autoPing: v })}
        />
      </Card>

      <Card title="📝 备注">
        <Field label="说明">
          <textarea
            className="plugkit-input"
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
            value={settings.note}
            placeholder="写下你的配置说明…"
            onChange={(e) => void updateSettings({ note: e.target.value })}
          />
          <span className="pk-stat-sub">内容自动保存至 storage</span>
        </Field>
      </Card>

      <SectionTitle>关于</SectionTitle>
      <div className="plugkit-card">
        <p className="pk-stat-sub" style={{ lineHeight: 1.8 }}>
          本插件演示了 PlugKit 基座的核心能力：
        </p>
        <ul className="pk-stat-sub" style={{ lineHeight: 1.8, margin: '4px 0 0', paddingLeft: 18 }}>
          <li>消息通道（popup ↔ background ↔ content，类型安全）</li>
          <li>响应式存储（useChromeStorage，多端实时同步）</li>
          <li>平台 API（getActiveTab / management 桥接）</li>
          <li>统一 UI 组件（Popup / Card / Toggle / ChipToggle / StatCard）</li>
        </ul>
      </div>
    </OptionsPage>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
