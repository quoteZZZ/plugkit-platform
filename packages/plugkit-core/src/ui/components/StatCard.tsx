import '../theme.css';

/** 统计卡：大数字 + 标签 + 副说明 */
export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="plugkit-card pk-stat">
      <div className="pk-stat-label">{label}</div>
      <div className="pk-stat-value">{value}</div>
      {sub && <div className="pk-stat-sub">{sub}</div>}
    </div>
  );
}
