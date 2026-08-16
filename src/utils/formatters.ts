/**
 * Utility formatters for CHECKSCROW financial UI
 */

/**
 * Formats a number as Nigerian Naira (₦)
 * e.g., 250000 -> "₦250,000.00" or "₦250,000"
 */
export function formatNaira(amount: number | null | undefined, showDecimals = true): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '₦ 0.00';
  }
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(absAmount);

  return `${isNegative ? '-' : ''}₦ ${formattedNumber}`;
}

/**
 * Format date string into readable Nigerian format
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}

/**
 * Format relative time (e.g., 2 hours ago)
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(dateString);
}

/**
 * Truncates long strings or hashes for UI
 */
export function truncateRef(str: string, lead = 6, tail = 4): string {
  if (!str) return '';
  if (str.length <= lead + tail) return str;
  return `${str.substring(0, lead)}...${str.substring(str.length - tail)}`;
}
