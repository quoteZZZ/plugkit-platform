import React from 'react';
import '../theme.css';

/** Popup 容器：固定宽度布局，保证各插件弹窗外观一致 */
export function Popup({ children }: { children: React.ReactNode }) {
  return <div className="plugkit-popup">{children}</div>;
}
