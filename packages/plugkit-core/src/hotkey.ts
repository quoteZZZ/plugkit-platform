// 热键解析 / 格式化 / 匹配工具（纯逻辑，无 React 依赖，content / background 亦可复用）

export interface HotkeyParts {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** 大写规范键名：'D' | 'ENTER' | 'ARROWUP' | ' ' 等 */
  key: string;
}

const MOD_ALIASES: Record<string, keyof Pick<HotkeyParts, 'ctrl' | 'alt' | 'shift' | 'meta'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
};

/** 解析 "Ctrl+Alt+D" 这类组合键字符串为标准结构 */
export function parseHotkey(combo: string): HotkeyParts {
  const parts: HotkeyParts = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  if (!combo) return parts;
  for (const raw of combo.split('+')) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (t in MOD_ALIASES) parts[MOD_ALIASES[t]] = true;
    else if (t === 'space') parts.key = ' ';
    else parts.key = t.toUpperCase();
  }
  return parts;
}

/** 将标准结构格式化为 "Ctrl+Alt+D" 显示字符串 */
export function formatHotkey(parts: HotkeyParts): string {
  const mods: string[] = [];
  if (parts.ctrl) mods.push('Ctrl');
  if (parts.alt) mods.push('Alt');
  if (parts.shift) mods.push('Shift');
  if (parts.meta) mods.push('Meta');
  const key = parts.key.toUpperCase();
  return [...mods, key === ' ' ? 'Space' : key].join('+');
}

/** 将键盘事件转换为组合键字符串（用于热键录制显示） */
export function eventToCombo(e: KeyboardEvent): string {
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else key = key.toUpperCase();
  return formatHotkey({
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
    key,
  });
}

/** 判断键盘事件是否匹配组合键（忽略大小写、兼容 e.code 兜底） */
export function matchHotkey(e: KeyboardEvent, combo: string): boolean {
  const p = parseHotkey(combo);
  if (!p.key) return false;
  const key = e.key === ' ' ? ' ' : e.key.length === 1 ? e.key.toUpperCase() : e.key.toUpperCase();
  const codeMatch = e.code === `Key${p.key}` || e.code === `Digit${p.key}`;
  return (
    e.ctrlKey === p.ctrl &&
    e.altKey === p.alt &&
    e.shiftKey === p.shift &&
    e.metaKey === p.meta &&
    (key === p.key || codeMatch)
  );
}
