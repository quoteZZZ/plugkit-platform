// 快捷键录制输入框：聚焦后按组合键自动录制，Esc 取消，退格清空
import React from 'react';
import { eventToCombo, formatHotkey, parseHotkey } from '../../hotkey';

interface HotkeyInputProps {
  value: string;
  onChange: (combo: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function HotkeyInput({
  value,
  onChange,
  placeholder = '点击后按组合键',
  style,
  className,
}: HotkeyInputProps): React.JSX.Element {
  const [recording, setRecording] = React.useState(false);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 聚焦后记录；重复按键不重复触发
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    // 纯修饰键按下不结束录制（等待主键）
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }
    if (e.key === 'Backspace') {
      onChange('');
      setRecording(false);
      return;
    }
    const combo = eventToCombo(e.nativeEvent);
    const p = parseHotkey(combo);
    // 必须有主键且至少有修饰键，避免纯字母/数字单键（易误触）
    if (p.key && (p.ctrl || p.alt || p.shift || p.meta)) {
      onChange(formatHotkey(p));
    }
    setRecording(false);
  };

  return (
    <input
      className={className || 'plugkit-input'}
      style={{ width: 130, ...style }}
      value={recording ? '…按下组合键' : value}
      placeholder={placeholder}
      readOnly
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={onKeyDown}
      title="点击后按下组合键录制；Esc 取消，退格清空"
    />
  );
}
