// Re-export everything from the new modular utils
// Explicitly re-export EventSearchResult from types to avoid ambiguity
export type { EventSearchResult } from './utils/types';
export * from './utils/eventUtils';
// Explicitly re-export publishEvent and fetchEventWithFallback from relayUtils to avoid ambiguity
export { publishEvent, fetchEventWithFallback } from './utils/relayUtils';
// Explicitly re-export tag-related functions from eventUtils
export { getTagValue, getTagValues } from './utils/eventUtils';
// Explicitly re-export relay group functions
export { ensureNDKEvent, selectedRelayGroup } from './utils/relayGroupUtils';
// Explicitly re-export publication-related functions
export { isParentPublication, isTopLevelParent } from './utils/eventUtils';
export * from './utils/profileUtils';
// Explicitly re-export from identifierUtils to avoid duplicates
export {
  NOSTR_PROFILE_REGEX,
  NOSTR_NOTE_REGEX,
  searchEventByIdentifier,
  processNostrIdentifiers,
  nprofileEncode,
} from './utils/identifierUtils';
// Explicitly re-export createNoteLink from profileUtils
export { createNoteLink } from './utils/profileUtils';
export * from './utils/commonUtils';
export * from './utils/dateUtils';
export * from './utils/uiUtils';
export * from './utils/types';
export * from './utils/eventEncoding';
export * from './utils/mime';
export * from './utils/npubCache';
export * from './utils/relayGroupUtils';
// Export markup parsers
export * from './utils/markup/basicMarkupParser';
export * from './utils/markup/advancedMarkupParser';
export { logCurrentRelays } from './utils/relayLog';
