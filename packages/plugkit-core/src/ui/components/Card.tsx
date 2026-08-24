import React from 'react';

/** 通用卡片容器：标题 + 副标题 + 内容，统一插件视觉语言 */
export function Card({
  title,
  subtitle,
  children,
  className,
  style,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`plugkit-card${className ? ` ${className}` : ''}`} style={style}>
      {title && (
        <div className="plugkit-card-head">
          <div className="plugkit-card-title">{title}</div>
          {subtitle && <div className="plugkit-card-sub">{subtitle}</div>}
        </div>
      )}
      <div className="plugkit-card-body">{children}</div>
    </div>
  );
}
