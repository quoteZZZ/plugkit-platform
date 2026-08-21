import React from 'react';
import '../theme.css';

/** 设置页容器 */
export function OptionsPage({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="plugkit-options">
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}
