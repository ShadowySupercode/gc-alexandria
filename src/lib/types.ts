export type Tab = {
  id: number;
  type: TabType;
  parent?: number;
  previous?: Tab;
  data?: unknown;
};

export type TabType =
  | "welcome"
  | "find"
  | "article"
  | "user"
  | "settings"
  | "editor";

export type EventCounts = { [kind: number]: number };

/**
 * Enum of Nostr event kinds relevant to Alexandria.
 * 
 * This enum consolidates all event kinds used throughout the codebase
 * to provide a single source of truth for event kind constants.
 */
export enum NostrKind {
  /** User metadata event (kind 0) */
  UserMetadata = 0,
  /** Text note event (kind 1) */
  TextNote = 1,
  /** Contact list event (kind 3) */
  ContactList = 3,
  /** Repost event (kind 6) */
  Repost = 6,
  /** Generic repost event (kind 16) */
  GenericRepost = 16,
  /** Image/media content event (kind 20) - NIP-94 */
  ImageMedia = 20,
  /** Normal video event (kind 21) - NIP-71 */
  NormalVideo = 21,
  /** Short video event (kind 22) - NIP-71 */
  ShortVideo = 22,
  /** Public message event (kind 24) */
  PublicMessage = 24,
  /** Generic reply event (kind 1111) */
  GenericReply = 1111,
  /** Issue event (kind 1621) */
  Issue = 1621,
  /** Issue comment event (kind 1622) */
  IssueComment = 1622,
  /** Root voice message event (kind 1222) - NIP-A0 */
  RootVoiceMessage = 1222,
  /** Reply voice message event (kind 1244) - NIP-A0 */
  ReplyVoiceMessage = 1244,
  /** Long-form note event (kind 30023) */
  LongFormNote = 30023,
  /** Publication index event (kind 30040) */
  PublicationIndex = 30040,
  /** Publication content event (kind 30041) */
  PublicationContent = 30041,
  /** Blossom server list event (kind 10063) - NIP-B7 */
  BlossomServerList = 10063,
  /** Wiki event (kind 30818) */
  Wiki = 30818,
  /** Highlight event (kind 9802) */
  Highlight = 9802,
}

/**
 * Array of zettel (content) event kinds
 */
export const ZETTEL_KINDS = [
  NostrKind.PublicationContent,
  NostrKind.Wiki,
  NostrKind.LongFormNote,
] as const;

/**
 * Array of repost event kinds
 */
export const REPOST_KINDS = [
  NostrKind.Repost,
  NostrKind.GenericRepost,
] as const;

/**
 * Array of publication-related event kinds
 */
export const PUBLICATION_KINDS = [
  NostrKind.PublicationIndex,
  NostrKind.PublicationContent,
  NostrKind.Wiki,
] as const;


