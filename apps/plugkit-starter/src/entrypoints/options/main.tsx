import React from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsPage, Field, Toggle } from '@plugkit/core/ui';
import { createStorage } from '@plugkit/core/storage';

const settings = createStorage<{ enabled: boolean; note: string }>('settings', {
  enabled: true,
  note: '',
});

function App() {
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    settings.get().then((s) => setEnabled(s.enabled));
  }, []);

  return (
    <OptionsPage title="插件设置">
      <Toggle
        label="启用功能"
        checked={enabled}
        onChange={(v) => {
          setEnabled(v);
          settings.set({ enabled: v });
        }}
      />
      <Field label="说明">这是基于 PlugKit 基座的示例设置页。</Field>
    </OptionsPage>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
