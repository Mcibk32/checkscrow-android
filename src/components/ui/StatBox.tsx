import React from 'react';
import { CurrencyDisplay } from './CurrencyDisplay';

export interface StatBoxProps {
  label: string;
  amount: number | null | undefined;
  subtext?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  accentColor?: 'emerald' | 'amber' | 'sky' | 'slate';
  className?: string;
}

export const StatBox: React.FC<StatBoxProps> = ({
  label,
  amount,
  subtext,
  badge,
  icon,
  className = '',
}) => {
  return (
    <div className={`p-5 rounded-xl bg-[#111318] border border-[#1E293B] ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        {badge || (icon && <span className="text-slate-400">{icon}</span>)}
      </div>
      <div className="text-2xl sm:text-3xl font-mono text-slate-100 tracking-tight tabular-nums">
        <CurrencyDisplay amount={amount} symbolClassName="text-emerald-400" />
      </div>
      {subtext && (
        <p className="text-xs text-slate-500 mt-2">{subtext}</p>
      )}
    </div>
  );
};
