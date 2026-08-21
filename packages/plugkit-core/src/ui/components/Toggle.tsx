import '../theme.css';

/** 开关控件：现代滑块样式，label 在左、开关在右 */
export function Toggle({
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
    <div className={`plugkit-toggle${disabled ? ' disabled' : ''}`}>
      <span>{label}</span>
      {/* 仅滑块区域可点击切换；点击文字不触发 */}
      <label className="control">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="track" />
      </label>
    </div>
  );
}
