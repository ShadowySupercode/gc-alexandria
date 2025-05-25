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
