import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefixSymbol?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  prefixSymbol,
  className = '',
  id,
  type = 'text',
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-300">
          {label}
        </label>
      )}
      <div className="relative flex items-center rounded-sm bg-[#111318] border border-[#1E293B] focus-within:border-emerald-500/80 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
        {prefixSymbol && (
          <span className="pl-3 text-sm font-semibold text-emerald-400 select-none">
            {prefixSymbol}
          </span>
        )}
        {leftIcon && !prefixSymbol && (
          <span className="pl-3 text-slate-400 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={`w-full bg-transparent px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
            prefixSymbol ? 'pl-1.5' : leftIcon ? 'pl-2' : ''
          } ${rightIcon ? 'pr-9' : ''} ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 flex items-center text-slate-400">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-rose-400 font-medium">{error}</p>
      )}
      {helperText && !error && (
        <p className="text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
