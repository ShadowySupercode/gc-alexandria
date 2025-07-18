// Re-export all search functionality from modular files
export * from "./search_types";
export * from "./search_utils";
export * from "./community_checker";
export * from "./profile_search";
export * from "./event_search";
export * from "./subscription_search";
export * from "./search_constants";

// Legacy exports for backward compatibility
export { searchProfiles } from "./profile_search";
export { searchBySubscription } from "./subscription_search";
export { searchEvent, searchNip05 } from "./event_search";
export { checkCommunity } from "./community_checker";
export {
  wellKnownUrl,
  lnurlpWellKnownUrl,
  isValidNip05Address,
  normalizeSearchTerm,
  fieldMatches,
  nip05Matches,
  COMMON_DOMAINS,
  isEmojiReaction,
  createProfileFromEvent,
} from "./search_utils";
