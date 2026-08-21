import React from 'react';

/** 键值展示行：label 固定宽度，value 自动换行 */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="plugkit-field">
      <span className="label">{label}</span>
      <span className="value">{children}</span>
    </div>
  );
}
