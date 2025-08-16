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
  COMMON_DOMAINS,
  createProfileFromEvent,
  fieldMatches,
  isEmojiReaction,
  isValidNip05Address,
  lnurlpWellKnownUrl,
  nip05Matches,
  normalizeSearchTerm,
  wellKnownUrl,
} from "./search_utils";
