/**
 * Simplifies a URL by removing protocol and common prefixes
 * @param url The URL to simplify
 * @returns Simplified URL string
 */
function simplifyUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + (urlObj.port ? `:${urlObj.port}` : "");
  } catch {
    // If URL parsing fails, return the original string
    return url;
  }
}

export interface RelayInfo {
  name?: string;
  description?: string;
  icon?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  tags?: string[];
  payments_url?: string;
  limitation?: {
    auth_required?: boolean;
    payment_required?: boolean;
  };
}

export interface RelayInfoWithMetadata extends RelayInfo {
  url: string;
  shortUrl: string;
  hasNip11: boolean;
  triedNip11: boolean;
}

/**
 * Fetches relay information using NIP-11
 * @param url The relay URL to fetch info for
 * @returns Promise resolving to relay info or undefined if failed
 */
export async function fetchRelayInfo(
  url: string,
): Promise<RelayInfoWithMetadata | undefined> {
  try {
    // Convert WebSocket URL to HTTP URL for NIP-11
    const httpUrl = url
      .replace("ws://", "http://")
      .replace("wss://", "https://");

    const response = await fetch(httpUrl, {
      headers: {
        Accept: "application/nostr+json",
        "User-Agent": "Alexandria/1.0",
      },
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(`[RelayInfo] HTTP ${response.status} for ${url}`);
      return {
        url,
        shortUrl: simplifyUrl(url),
        hasNip11: false,
        triedNip11: true,
      };
    }

    const relayInfo = (await response.json()) as RelayInfo;

    return {
      ...relayInfo,
      url,
      shortUrl: simplifyUrl(url),
      hasNip11: Object.keys(relayInfo).length > 0,
      triedNip11: true,
    };
  } catch (error) {
    console.warn(`[RelayInfo] Failed to fetch info for ${url}:`, error);
    return {
      url,
      shortUrl: simplifyUrl(url),
      hasNip11: false,
      triedNip11: true,
    };
  }
}

/**
 * Fetches relay information for multiple relays in parallel
 * @param urls Array of relay URLs to fetch info for
 * @returns Promise resolving to array of relay info objects
 */
export async function fetchRelayInfos(
  urls: string[],
): Promise<RelayInfoWithMetadata[]> {
  if (urls.length === 0) {
    return [];
  }

  const promises = urls.map((url) => fetchRelayInfo(url));
  const results = await Promise.allSettled(promises);

  return results
    .map((result) => (result.status === "fulfilled" ? result.value : undefined))
    .filter((info): info is RelayInfoWithMetadata => info !== undefined);
}

/**
 * Gets relay type label based on relay URL and info
 * @param relayUrl The relay URL
 * @param relayInfo Optional relay info
 * @returns String describing the relay type
 */
export function getRelayTypeLabel(
  relayUrl: string,
  relayInfo?: RelayInfoWithMetadata,
): string {
  // Check if it's a local relay
  if (relayUrl.includes("localhost") || relayUrl.includes("127.0.0.1")) {
    return "Local";
  }

  // Check if it's a community relay
  if (
    relayUrl.includes("nostr.band") ||
    relayUrl.includes("noswhere.com") ||
    relayUrl.includes("damus.io") ||
    relayUrl.includes("nostr.wine")
  ) {
    return "Community";
  }

  // Check if it's a user's relay (likely inbox/outbox)
  if (
    relayUrl.includes("relay.nsec.app") ||
    relayUrl.includes("relay.snort.social")
  ) {
    return "User";
  }

  // Use relay name if available
  if (relayInfo?.name) {
    return relayInfo.name;
  }

  // Fallback to domain
  try {
    const domain = new URL(relayUrl).hostname;
    return domain.replace("www.", "");
  } catch {
    return "Unknown";
  }
}

/**
 * Gets relay icon URL or fallback
 * @param relayInfo Relay info object
 * @param relayUrl Relay URL as fallback
 * @returns Icon URL or undefined
 */
export function getRelayIcon(
  relayInfo?: RelayInfoWithMetadata,
  relayUrl?: string,
): string | undefined {
  if (relayInfo?.icon) {
    return relayInfo.icon;
  }

  // Generate favicon URL from relay URL
  if (relayUrl) {
    try {
      const url = new URL(relayUrl);
      return `${url.protocol}//${url.hostname}/favicon.ico`;
    } catch {
      // Invalid URL, return undefined
    }
  }

  return undefined;
}
