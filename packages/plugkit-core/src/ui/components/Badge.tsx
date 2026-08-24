import React from 'react';
import '../theme.css';

/** 状态徽章 */
export function Badge({
  tone = 'muted',
  children,
  style,
}: {
  tone?: 'success' | 'muted' | 'accent' | 'danger';
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`plugkit-badge ${tone}`} style={style}>
      {children}
    </span>
  );
}
