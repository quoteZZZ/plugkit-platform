import React from 'react';
import '../theme.css';

/** 按钮：primary / danger 变体；统一两插件按钮样式 */
export function Button({
  variant,
  children,
  ...rest
}: {
  variant?: 'primary' | 'danger';
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['plugkit-btn'];
  if (variant === 'primary') cls.push('plugkit-btn-primary');
  if (variant === 'danger') cls.push('plugkit-btn-danger');
  return (
    <button className={cls.join(' ')} {...rest}>
      {children}
    </button>
  );
}
