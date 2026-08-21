import React from 'react';
import '../theme.css';

/** 分组标题 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="plugkit-section-title">{children}</div>;
}
