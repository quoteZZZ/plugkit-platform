import React from 'react';
import '../theme.css';

/** 状态徽章 */
export function Badge({
  tone = 'muted',
  children,
}: {
  tone?: 'success' | 'muted' | 'accent' | 'danger';
  children: React.ReactNode;
}) {
  return <span className={`plugkit-badge ${tone}`}>{children}</span>;
}
