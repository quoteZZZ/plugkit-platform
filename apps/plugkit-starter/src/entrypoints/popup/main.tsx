import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup, Field, Button } from '@plugkit/core/ui';
import { defineChannel } from '@plugkit/core/messaging';
import { createStorage } from '@plugkit/core/storage';
import { getActiveTab } from '@plugkit/core/platform';
import { createLogger } from '@plugkit/core/logger';

const logger = createLogger('popup');

// 类型安全通道：与 background / content 中定义的同名通道对应
const ping = defineChannel<void, { pong: true; time: number }>('PING');
const getTitle = defineChannel<void, string>('GET_TITLE');
const last = createStorage<{ value: string }>('demo', { value: '' });

function App() {
  const [title, setTitle] = React.useState('…');
  const [url, setUrl] = React.useState('…');
  const [resp, setResp] = React.useState('');

  React.useEffect(() => {
    getActiveTab().then((tab) => {
      setTitle(tab?.title ?? '');
      setUrl(tab?.url ?? '');
    });
  }, []);

  const copy = async () => {
    const text = `${title}\n${url}`;
    await navigator.clipboard.writeText(text);
    await last.set({ value: text });
    logger.info('已复制', text);
    setResp('已复制 ✓（已记入 storage）');
  };

  const doPing = async () => {
    const r = await ping.send();
    setResp('后台回复: ' + JSON.stringify(r));
  };

  const fromPage = async () => {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    const t = await getTitle.send({ tabId: tab.id });
    setResp('页面标题: ' + t);
  };

  return (
    <Popup>
      <h3>当前页面</h3>
      <Field label="标题">{title}</Field>
      <Field label="URL">{url}</Field>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button onClick={copy}>复制标题与URL</Button>
        <Button onClick={doPing}>Ping 后台</Button>
        <Button onClick={fromPage}>从页面取标题</Button>
      </div>
      <p style={{ fontSize: 12, color: '#57606a', margin: '8px 0 0' }}>{resp}</p>
    </Popup>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
