import { NDKEvent } from "@nostr-dev-kit/ndk";

/**
 * Generate well-known NIP-05 URL
 */
export function wellKnownUrl(domain: string, name: string): string {
  return `https://${domain}/.well-known/nostr.json?name=${name}`;
}

/**
 * Generate well-known LNURLp URL for Lightning Network addresses
 */
export function lnurlpWellKnownUrl(domain: string, name: string): string {
  return `https://${domain}/.well-known/lnurlp/${name}`;
}

/**
 * Validate NIP-05 address format
 */
export function isValidNip05Address(address: string): boolean {
  return /^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(address);
}

/**
 * Helper function to normalize search terms
 */
export function normalizeSearchTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, "");
}

/**
 * Helper function to check if a profile field matches the search term
 */
export function fieldMatches(field: string, searchTerm: string): boolean {
  if (!field) return false;
  const fieldLower = field.toLowerCase();
  const fieldNormalized = fieldLower.replace(/\s+/g, "");
  const searchTermLower = searchTerm.toLowerCase();
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  // Check exact match
  if (fieldLower === searchTermLower) return true;
  if (fieldNormalized === normalizedSearchTerm) return true;

  // Check if field contains the search term
  if (fieldLower.includes(searchTermLower)) return true;
  if (fieldNormalized.includes(normalizedSearchTerm)) return true;

  // Check individual words (handle spaces in display names)
  const words = fieldLower.split(/\s+/);
  return words.some((word) => word.includes(searchTermLower));
}

/**
 * Helper function to check if NIP-05 address matches the search term
 */
export function nip05Matches(nip05: string, searchTerm: string): boolean {
  if (!nip05) return false;
  const nip05Lower = nip05.toLowerCase();
  const searchTermLower = searchTerm.toLowerCase();
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  // Check if the part before @ contains the search term
  const atIndex = nip05Lower.indexOf("@");
  if (atIndex !== -1) {
    const localPart = nip05Lower.substring(0, atIndex);
    const localPartNormalized = localPart.replace(/\s+/g, "");
    return (
      localPart.includes(searchTermLower) ||
      localPartNormalized.includes(normalizedSearchTerm)
    );
  }
  return false;
}

/**
 * Common domains for NIP-05 lookups
 */
export const COMMON_DOMAINS = [
  "gitcitadel.com",
  "theforest.nostr1.com",
  "nostr1.com",
  "nostr.land",
  "sovbit.host",
] as const;

/**
 * Check if an event is an emoji reaction (kind 7)
 */
export function isEmojiReaction(event: NDKEvent): boolean {
  return event.kind === 7;
}

/**
 * Create a profile object from event data
 */
// deno-lint-ignore no-explicit-any
export function createProfileFromEvent(event: NDKEvent, profileData: any): any {
  return {
    name: profileData.name,
    displayName: profileData.displayName || profileData.display_name,
    nip05: profileData.nip05,
    picture: profileData.picture,
    about: profileData.about,
    banner: profileData.banner,
    website: profileData.website,
    lud16: profileData.lud16,
    pubkey: event.pubkey,
  };
}
