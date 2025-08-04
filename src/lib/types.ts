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
 */
export enum NostrKind {
  /** User metadata event (kind 0) */
  UserMetadata = 0,
  /** Text note event (kind 1) */
  TextNote = 1,
  /** Publication index event (kind 30040) */
  PublicationIndex = 30040,
  /** Publication content event (kind 30041) */
  PublicationContent = 30041,
  /** Wiki event (kind 30818) */
  Wiki = 30818,
}
