import type { NDKEvent } from '@nostr-dev-kit/ndk';

// OpenGraph data type
export interface OpenGraphData {
  title?: string;
  description?: string;
  image?: string;
  url: string;
}

// Define a type for content segments
export type ContentSegment = 
  | { type: 'text', content: string }
  | { type: 'npub', npub: string }
  | { type: 'nprofile', nprofile: string, pubkey: string | null }
  | { type: 'nevent', nevent: string }
  | { type: 'naddr', naddr: string }
  | { type: 'note', note: string }
  | { type: 'url', url: string, ogData?: OpenGraphData, isVideo?: boolean, isYouTube?: boolean, isImage?: boolean };

// Type for parsed content
export interface ParsedContent {
  text: string;
  images: string[];
  npubs: string[];
  nprofiles: string[];
  nevents: string[];
  naddrs: string[];
  notes: string[];
  urls: string[];
}

// Type for profile data
export interface ProfileData {
  name?: string;
  displayName?: string;
}

// Type for decoded nevent data
export interface DecodedNevent {
  eventId?: string;
  suggestedRelays: string[];
}

// Type for reposted content
export interface RepostedContent {
  content: string;
  pubkey: string;
}
