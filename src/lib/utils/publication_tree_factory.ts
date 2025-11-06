/**
 * Factory for creating PublicationTree instances from AsciiDoc content
 *
 * This integrates the AST parser with Michael's PublicationTree architecture,
 * providing a clean bridge between AsciiDoc parsing and Nostr event publishing.
 */

import { PublicationTree } from "$lib/data_structures/publication_tree";
import { SveltePublicationTree } from "$lib/components/publications/svelte_publication_tree.svelte";
import { parseAsciiDocAST } from "$lib/utils/asciidoc_ast_parser";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { getMimeTags } from "$lib/utils/mime";

export interface PublicationTreeFactoryResult {
  tree: PublicationTree;
  svelteTree: SveltePublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  metadata: {
    title: string;
    totalSections: number;
    contentType: "article" | "scattered-notes" | "none";
    attributes: Record<string, string>;
  };
}

/**
 * Create a PublicationTree from AsciiDoc content using AST parsing
 * This is the main integration point between AST parsing and PublicationTree
 */
export async function createPublicationTreeFromContent(
  content: string,
  ndk: NDK,
  parseLevel: number = 2,
): Promise<PublicationTreeFactoryResult> {
  // For preview purposes, we can work without authentication
  // Authentication is only required for actual publishing
  const hasActiveUser = !!ndk.activeUser;

  // Parse content using AST
  const parsed = parseAsciiDocAST(content, parseLevel);

  // Determine content type
  const contentType = detectContentType(parsed);

  let tree: PublicationTree;
  let indexEvent: NDKEvent | null = null;
  const contentEvents: NDKEvent[] = [];

  if (contentType === "article" && parsed.title) {
    // Create hierarchical structure: 30040 index + 30041 content events
    indexEvent = createIndexEvent(parsed, ndk);
    tree = new PublicationTree(indexEvent, ndk);

    // Add content events to tree
    for (const section of parsed.sections) {
      const contentEvent = createContentEvent(section, parsed, ndk);
      await tree.addEvent(contentEvent, indexEvent);
      contentEvents.push(contentEvent);
    }
  } else if (contentType === "scattered-notes") {
    // Create flat structure: only 30041 events
    if (parsed.sections.length === 0) {
      throw new Error("No sections found for scattered notes");
    }

    // Use first section as root for tree structure
    const firstSection = parsed.sections[0];
    const rootEvent = createContentEvent(firstSection, parsed, ndk);
    tree = new PublicationTree(rootEvent, ndk);
    contentEvents.push(rootEvent);

    // Add remaining sections
    for (let i = 1; i < parsed.sections.length; i++) {
      const contentEvent = createContentEvent(parsed.sections[i], parsed, ndk);
      await tree.addEvent(contentEvent, rootEvent);
      contentEvents.push(contentEvent);
    }
  } else {
    throw new Error("No valid content found to create publication tree");
  }

  // Create reactive Svelte wrapper
  const svelteTree = new SveltePublicationTree(
    indexEvent || contentEvents[0],
    ndk,
  );

  return {
    tree,
    svelteTree,
    indexEvent,
    contentEvents,
    metadata: {
      title: parsed.title,
      totalSections: parsed.sections.length,
      contentType,
      attributes: parsed.attributes,
    },
  };
}

/**
 * Create a 30040 index event from parsed document
 */
function createIndexEvent(parsed: any, ndk: NDK): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30040;
  event.created_at = Math.floor(Date.now() / 1000);
  // Use placeholder pubkey for preview if no active user
  event.pubkey = ndk.activeUser?.pubkey || "preview-placeholder-pubkey";

  // Generate d-tag from title
  const dTag = generateDTag(parsed.title);
  const [mTag, MTag] = getMimeTags(30040);

  const tags: string[][] = [["d", dTag], mTag, MTag, ["title", parsed.title]];

  // Add document attributes as tags
  addDocumentAttributesToTags(tags, parsed.attributes, event.pubkey);

  // Generate publication abbreviation for namespacing sections
  const pubAbbrev = generateTitleAbbreviation(parsed.title);

  // Add a-tags for each section (30041 references)
  // Using new format: kind:pubkey:{abbv}-{section-d-tag}
  parsed.sections.forEach((section: any) => {
    const sectionDTag = generateDTag(section.title);
    const namespacedDTag = `${pubAbbrev}-${sectionDTag}`;
    tags.push(["a", `30041:${event.pubkey}:${namespacedDTag}`]);
  });

  event.tags = tags;
  event.content = parsed.content || generateIndexContent(parsed);

  return event;
}

/**
 * Create a 30041 content event from parsed section
 */
function createContentEvent(
  section: any,
  documentParsed: any,
  ndk: NDK,
): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30041;
  event.created_at = Math.floor(Date.now() / 1000);

  // Use placeholder pubkey for preview if no active user
  event.pubkey = ndk.activeUser?.pubkey || "preview-placeholder-pubkey";

  // Generate namespaced d-tag using publication abbreviation
  const sectionDTag = generateDTag(section.title);
  const pubAbbrev = generateTitleAbbreviation(documentParsed.title);
  const namespacedDTag = `${pubAbbrev}-${sectionDTag}`;

  const [mTag, MTag] = getMimeTags(30041);

  const tags: string[][] = [
    ["d", namespacedDTag],
    mTag,
    MTag,
    ["title", section.title],
  ];

  // Add section-specific attributes
  addSectionAttributesToTags(tags, section.attributes);

  // Add document-level attributes that should be inherited
  inheritDocumentAttributes(tags, documentParsed.attributes);

  event.tags = tags;
  event.content = section.content || "";

  return event;
}

/**
 * Detect content type based on parsed structure
 */
function detectContentType(
  parsed: any,
): "article" | "scattered-notes" | "none" {
  const hasDocTitle = !!parsed.title;
  const hasSections = parsed.sections.length > 0;

  // Check if the "title" is actually just the first section title
  // This happens when AsciiDoc starts with == instead of =
  const titleMatchesFirstSection =
    parsed.sections.length > 0 && parsed.title === parsed.sections[0].title;

  if (hasDocTitle && hasSections && !titleMatchesFirstSection) {
    return "article";
  } else if (hasSections) {
    return "scattered-notes";
  }

  return "none";
}

/**
 * Generate deterministic d-tag from title
 */
function generateDTag(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

/**
 * Generate title abbreviation from first letters of each word
 * Used for namespacing section a-tags
 * @param title - The publication title
 * @returns Abbreviation string (e.g., "My Test Article" → "mta")
 */
function generateTitleAbbreviation(title: string): string {
  if (!title || !title.trim()) {
    return "u"; // "untitled"
  }

  // Split on non-alphanumeric characters and filter out empty strings
  const words = title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "u";
  }

  // Take first letter of each word and join
  return words
    .map((word) => word.charAt(0).toLowerCase())
    .join("");
}

/**
 * Add document attributes as Nostr tags
 */
function addDocumentAttributesToTags(
  tags: string[][],
  attributes: Record<string, string>,
  pubkey: string,
) {
  // Standard metadata
  if (attributes.author) tags.push(["author", attributes.author]);
  if (attributes.version) tags.push(["version", attributes.version]);
  if (attributes.published) tags.push(["published", attributes.published]);
  if (attributes.language) tags.push(["language", attributes.language]);
  if (attributes.image) tags.push(["image", attributes.image]);
  if (attributes.description) tags.push(["summary", attributes.description]);

  // Tags
  if (attributes.tags) {
    attributes.tags.split(",").forEach((tag) => tags.push(["t", tag.trim()]));
  }

  // Add pubkey reference
  tags.push(["p", pubkey]);

  // Custom attributes (filtered)
  addCustomAttributes(tags, attributes);
}

/**
 * Add section-specific attributes as tags
 */
function addSectionAttributesToTags(
  tags: string[][],
  attributes: Record<string, string>,
) {
  addCustomAttributes(tags, attributes);
}

/**
 * Inherit relevant document attributes for content events
 */
function inheritDocumentAttributes(
  tags: string[][],
  documentAttributes: Record<string, string>,
) {
  // Inherit selected document attributes
  if (documentAttributes.language)
    tags.push(["language", documentAttributes.language]);
  if (documentAttributes.type) tags.push(["type", documentAttributes.type]);
}

/**
 * Add custom attributes, filtering out system ones
 */
function addCustomAttributes(
  tags: string[][],
  attributes: Record<string, string>,
) {
  const systemAttributes = [
    "attribute-undefined",
    "attribute-missing",
    "appendix-caption",
    "appendix-refsig",
    "caution-caption",
    "chapter-refsig",
    "example-caption",
    "figure-caption",
    "important-caption",
    "last-update-label",
    "manname-title",
    "note-caption",
    "part-refsig",
    "preface-title",
    "section-refsig",
    "table-caption",
    "tip-caption",
    "toc-title",
    "untitled-label",
    "version-label",
    "warning-caption",
    "asciidoctor",
    "asciidoctor-version",
    "safe-mode-name",
    "backend",
    "doctype",
    "basebackend",
    "filetype",
    "outfilesuffix",
    "stylesdir",
    "iconsdir",
    "localdate",
    "localyear",
    "localtime",
    "localdatetime",
    "docdate",
    "docyear",
    "doctime",
    "docdatetime",
    "doctitle",
    "embedded",
    "notitle",
    // Already handled above
    "author",
    "version",
    "published",
    "language",
    "image",
    "description",
    "tags",
    "title",
    "type",
  ];

  Object.entries(attributes).forEach(([key, value]) => {
    if (!systemAttributes.includes(key) && value && typeof value === "string") {
      tags.push([key, value]);
    }
  });
}

/**
 * Generate default index content if none provided
 */
function generateIndexContent(parsed: any): string {
  return `# ${parsed.title}

${parsed.sections.length} sections available:

${parsed.sections
  .map((section: any, i: number) => `${i + 1}. ${section.title}`)
  .join("\n")}`;
}

/**
 * Export events from PublicationTree for publishing
 * This provides compatibility with the current publishing workflow
 */
export async function exportEventsFromTree(
  result: PublicationTreeFactoryResult,
) {
  const events: any[] = [];

  // Add index event if it exists
  if (result.indexEvent) {
    events.push(eventToPublishableObject(result.indexEvent));
  }

  // Add content events
  result.contentEvents.forEach((event) => {
    events.push(eventToPublishableObject(event));
  });

  return {
    indexEvent: result.indexEvent
      ? eventToPublishableObject(result.indexEvent)
      : undefined,
    contentEvents: result.contentEvents.map(eventToPublishableObject),
    tree: result.tree,
  };
}

/**
 * Convert NDKEvent to publishable object format
 */
function eventToPublishableObject(event: NDKEvent) {
  return {
    kind: event.kind,
    content: event.content,
    tags: event.tags,
    created_at: event.created_at,
    pubkey: event.pubkey,
    id: event.id,
    title: event.tags.find((t) => t[0] === "title")?.[1] || "Untitled",
  };
}
