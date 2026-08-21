import '../theme.css';

/** 开关控件：现代滑块样式，label 在左、开关在右 */
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="plugkit-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" />
    </label>
  );
}
