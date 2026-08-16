import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = 'Service Connection Alert',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div className={`p-4 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-200 flex items-start gap-3 ${className}`}>
      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs">
        <h5 className="font-semibold text-rose-300 mb-0.5">{title}</h5>
        <p className="text-rose-200/80 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          className="shrink-0 border-rose-800 text-rose-300 hover:bg-rose-900/50 hover:text-white"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
