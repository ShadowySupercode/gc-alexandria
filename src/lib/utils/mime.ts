import { EVENT_KINDS, EVENT_TYPES, getEventType } from "./search_constants";
import { NostrKind } from "../types";

/**
 * Get MIME tags for a Nostr event based on its kind number
 * Returns an array of tags: [["m", mime-type], ["M", nostr-mime-type]]
 * Following NKBIP-06 and NIP-94 specifications
 */
export function getMimeTags(kind: number): [string, string][] {
  // Default tags for unknown kinds
  let mTag: [string, string] = ["m", "text/plain"];
  let MTag: [string, string] = ["M", "note/generic/regular"];

  // Determine event type for MIME tags
  const eventType = getEventType(kind);

  switch (kind) {
    // User metadata (kind 0)
    case NostrKind.UserMetadata:
      mTag = ["m", "application/json"];
      MTag = ["M", `meta-data/user/${eventType}`];
      break;

    // Short text note
    case NostrKind.TextNote:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/microblog/${eventType}`];
      break;

    // Contact list (kind 3)
    case NostrKind.ContactList:
      mTag = ["m", "application/json"];
      MTag = ["M", `meta-data/contacts/${eventType}`];
      break;

    // Repost (kind 6)
    case NostrKind.Repost:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/repost/${eventType}`];
      break;

    // Generic repost (kind 16)
    case NostrKind.GenericRepost:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/generic-repost/${eventType}`];
      break;

    // Reaction (kind 7)
    case NostrKind.Reaction:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/reaction/${eventType}`];
      break;

    // Image/media content (NIP-94)
    case NostrKind.ImageMedia:
      mTag = ["m", "image/*"];
      MTag = ["M", `media/image/${eventType}`];
      break;

    // Normal video (NIP-71)
    case NostrKind.NormalVideo:
      mTag = ["m", "video/*"];
      MTag = ["M", `media/video/normal/${eventType}`];
      break;

    // Short video (NIP-71)
    case NostrKind.ShortVideo:
      mTag = ["m", "video/*"];
      MTag = ["M", `media/video/short/${eventType}`];
      break;

    // Public message (kind 24)
    case NostrKind.PublicMessage:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/public-message/${eventType}`];
      break;

    // Generic reply
    case NostrKind.GenericReply:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/comment/${eventType}`];
      break;

    // Issue
    case NostrKind.Issue:
      mTag = ["m", "text/markup"];
      MTag = ["M", `git/issue/${eventType}`];
      break;

    // Issue comment
    case NostrKind.IssueComment:
      mTag = ["m", "text/markup"];
      MTag = ["M", `git/comment/${eventType}`];
      break;

    // Root voice message (NIP-A0)
    case NostrKind.RootVoiceMessage:
      mTag = ["m", "audio/*"];
      MTag = ["M", `media/audio/root/${eventType}`];
      break;

    // Reply voice message (NIP-A0)
    case NostrKind.ReplyVoiceMessage:
      mTag = ["m", "audio/*"];
      MTag = ["M", `media/audio/reply/${eventType}`];
      break;

    // Long-form note
    case NostrKind.LongFormNote:
      mTag = ["m", "text/markup"];
      MTag = ["M", `article/long-form/${eventType}`];
      break;

    // Book metadata
    case NostrKind.PublicationIndex:
      mTag = ["m", "application/json"];
      MTag = ["M", `meta-data/index/${eventType}`];
      break;

    // Book content
    case NostrKind.PublicationContent:
      mTag = ["m", "text/asciidoc"];
      MTag = ["M", `article/publication-content/${eventType}`];
      break;

    // Blossom server list (NIP-B7)
    case NostrKind.BlossomServerList:
      mTag = ["m", "application/json"];
      MTag = ["M", `blossom/server-list/${eventType}`];
      break;

    // Wiki page
    case NostrKind.Wiki:
      mTag = ["m", "text/asciidoc"];
      MTag = ["M", `article/wiki/${eventType}`];
      break;

    // Zap receipt (kind 9735)
    case NostrKind.ZapReceipt:
      mTag = ["m", "application/json"];
      MTag = ["M", `zap/receipt/${eventType}`];
      break;

    // Highlight (kind 9802)
    case NostrKind.Highlight:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/highlight/${eventType}`];
      break;

    // Add more cases as needed...
  }

  return [mTag, MTag];
}
