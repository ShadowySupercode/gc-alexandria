// Re-export all search functionality from modular files
export * from "./search_types.ts";
export * from "./search_utils.ts";
export * from "./community_checker.ts";
export * from "./profile_search.ts";
export * from "./event_search.ts";
export * from "./subscription_search.ts";
export * from "./search_constants.ts";

// Legacy exports for backward compatibility
export { searchProfiles } from "./profile_search.ts";
export { searchBySubscription } from "./subscription_search.ts";
export { searchEvent, searchNip05 } from "./event_search.ts";
export { checkCommunity } from "./community_checker.ts";
export {
  COMMON_DOMAINS,
  createProfileFromEvent,
  fieldMatches,
  isEmojiReaction,
  isValidNip05Address,
  lnurlpWellKnownUrl,
  nip05Matches,
  normalizeSearchTerm,
  wellKnownUrl,
} from "./search_utils.ts";
