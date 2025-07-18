import { EVENT_KINDS } from "./search_constants";

/**
 * Determine the type of Nostr event based on its kind number
 * Following NIP specification for kind ranges:
 * - Replaceable: 0, 3, 10000-19999 (only latest stored)
 * - Ephemeral: 20000-29999 (not stored)
 * - Addressable: 30000-39999 (latest per d-tag stored)
 * - Regular: all other kinds (stored by relays)
 */
export function getEventType(
  kind: number,
): "regular" | "replaceable" | "ephemeral" | "addressable" {
  // Check special ranges first
  if (
    kind >= EVENT_KINDS.ADDRESSABLE.MIN &&
    kind < EVENT_KINDS.ADDRESSABLE.MAX
  ) {
    return "addressable";
  }

  if (
    kind >= EVENT_KINDS.PARAMETERIZED_REPLACEABLE.MIN &&
    kind < EVENT_KINDS.PARAMETERIZED_REPLACEABLE.MAX
  ) {
    return "ephemeral";
  }

  if (
    (kind >= EVENT_KINDS.REPLACEABLE.MIN &&
      kind < EVENT_KINDS.REPLACEABLE.MAX) ||
    EVENT_KINDS.REPLACEABLE.SPECIFIC.includes(kind as 0 | 3)
  ) {
    return "replaceable";
  }

  // Everything else is regular
  return "regular";
}

/**
 * Get MIME tags for a Nostr event based on its kind number
 * Returns an array of tags: [["m", mime-type], ["M", nostr-mime-type]]
 * Following NKBIP-06 and NIP-94 specifications
 */
export function getMimeTags(kind: number): [string, string][] {
  // Default tags for unknown kinds
  let mTag: [string, string] = ["m", "text/plain"];
  let MTag: [string, string] = ["M", "note/generic/nonreplaceable"];

  // Determine replaceability based on event type
  const eventType = getEventType(kind);
  const replaceability =
    eventType === "replaceable" || eventType === "addressable"
      ? "replaceable"
      : "nonreplaceable";

  switch (kind) {
    // Short text note
    case 1:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/microblog/${replaceability}`];
      break;

    // Generic reply
    case 1111:
      mTag = ["m", "text/plain"];
      MTag = ["M", `note/comment/${replaceability}`];
      break;

    // Issue
    case 1621:
      mTag = ["m", "text/markup"];
      MTag = ["M", `git/issue/${replaceability}`];
      break;

    // Issue comment
    case 1622:
      mTag = ["m", "text/markup"];
      MTag = ["M", `git/comment/${replaceability}`];
      break;

    // Book metadata
    case 30040:
      mTag = ["m", "application/json"];
      MTag = ["M", `meta-data/index/${replaceability}`];
      break;

    // Book content
    case 30041:
      mTag = ["m", "text/asciidoc"];
      MTag = ["M", `article/publication-content/${replaceability}`];
      break;

    // Wiki page
    case 30818:
      mTag = ["m", "text/asciidoc"];
      MTag = ["M", `article/wiki/${replaceability}`];
      break;

    // Long-form note
    case 30023:
      mTag = ["m", "text/markup"];
      MTag = ["M", `article/long-form/${replaceability}`];
      break;

    // Add more cases as needed...
  }

  return [mTag, MTag];
}
