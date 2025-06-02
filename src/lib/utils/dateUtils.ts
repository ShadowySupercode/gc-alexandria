/**
 * Formats a Unix timestamp into a human-readable date string
 * @param timestamp Unix timestamp in seconds
 * @returns Formatted date string (e.g. "Jan 01, 2023")
 */
export function formatTimestampToDate(timestamp?: number | null): string {
  if (!timestamp) return "";

  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

/**
 * Format a Unix timestamp into a human-readable date string
 * @param unixtimestamp Unix timestamp in seconds
 * @returns Formatted date string (e.g. "15 Jan 2024")
 */
export function formatDate(unixtimestamp: number): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const date = new Date(unixtimestamp * 1000);
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Format a Unix timestamp into a relative time string (e.g. "2 hours ago")
 * @param unixtimestamp Unix timestamp in seconds
 * @returns Relative time string
 */
export function formatRelativeTime(unixtimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixtimestamp;

  if (diff < 60) {
    return 'just now';
  }

  const minutes = Math.floor(diff / 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
