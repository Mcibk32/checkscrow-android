import React from 'react';

export interface CurrencyDisplayProps {
  amount: number | null | undefined;
  showDecimals?: boolean;
  className?: string;
  symbolClassName?: string;
  showPrefixSign?: string;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  showDecimals = true,
  className = '',
  symbolClassName = '',
  showPrefixSign = '',
}) => {
  const val = amount ?? 0;
  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(Math.abs(val));

  const isNegative = val < 0;

  return (
    <span className={`inline-flex items-baseline font-mono tracking-normal whitespace-nowrap ${className}`}>
      {showPrefixSign && <span>{showPrefixSign}</span>}
      {isNegative && <span>-</span>}
      <span className={`font-sans font-medium mr-1 select-none ${symbolClassName}`}>₦</span>
      <span>{formattedNumber}</span>
    </span>
  );
};
