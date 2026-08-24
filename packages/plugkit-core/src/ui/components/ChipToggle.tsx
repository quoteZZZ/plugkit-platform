import '../theme.css';

/** 胶囊式紧凑开关：文字+圆点按钮，适合 popup 多开关并排，比 Toggle 更省垂直空间 */
export function ChipToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`plugkit-chip-toggle${checked ? ' on' : ''}${disabled ? ' disabled' : ''}`}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      title={label}
    >
      <span className="dot" />
      <span className="text">{label}</span>
    </button>
  );
}
