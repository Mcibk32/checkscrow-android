import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'info' | 'danger' | 'neutral' | 'emerald';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  icon,
  className = '',
}) => {
  const variantStyles: Record<BadgeVariant, string> = {
    emerald: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50',
    success: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/40',
    warning: 'bg-amber-950/70 text-amber-400 border-amber-800/40',
    info: 'bg-sky-950/70 text-sky-400 border-sky-800/40',
    danger: 'bg-rose-950/70 text-rose-400 border-rose-800/40',
    neutral: 'bg-slate-800/80 text-slate-300 border-slate-700/50',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 font-medium',
    md: 'text-xs px-2.5 py-1 gap-1.5 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border tracking-wide whitespace-nowrap ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
