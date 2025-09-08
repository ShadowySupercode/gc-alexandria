/**
 * NKBIP-01 Compliant Publication Tree Processor
 *
 * Implements proper Asciidoctor tree processor extension pattern for building
 * PublicationTree structures during document parsing. Supports iterative parsing
 * at different hierarchy levels (2-7) as defined in NKBIP-01 specification.
 */

import type { Document, Registry } from "asciidoctor";
import { PublicationTree } from "$lib/data_structures/publication_tree";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { getMimeTags } from "$lib/utils/mime";

// For debugging tree structure
const DEBUG = process.env.DEBUG_TREE_PROCESSOR === false;
export interface ProcessorResult {
  tree: PublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  metadata: {
    title: string;
    totalSections: number;
    contentType: "article" | "scattered-notes" | "none";
    attributes: Record<string, string>;
    parseLevel: number;
    eventStructure: EventStructureNode[];
  };
}

export interface EventStructureNode {
  title: string;
  level: number;
  eventType: "index" | "content";
  eventKind: 30040 | 30041;
  dTag: string;
  children: EventStructureNode[];
}

interface ContentSegment {
  title: string;
  content: string;
  level: number;
  attributes: Record<string, string>;
  startLine: number;
  endLine: number;
}

interface HierarchicalSegment extends ContentSegment {
  hasChildren: boolean;
  children: ContentSegment[];
}

/**
 * Register the PublicationTree processor extension with Asciidoctor
 * This follows the official extension pattern exactly as provided by the user
 */
export function registerPublicationTreeProcessor(
  registry: Registry,
  ndk: NDK,
  parseLevel: number = 2,
  originalContent: string,
): { getResult: () => ProcessorResult | null } {
  let processorResult: ProcessorResult | null = null;

  registry.treeProcessor(function () {
    const self = this;

    self.process(function (doc: Document) {
      try {
        // Extract document metadata from AST
        const title = doc.getTitle() || "";
        const attributes = doc.getAttributes();
        const sections = doc.getSections();

        console.log(`[TreeProcessor] Document attributes:`, {
          tags: attributes.tags,
          author: attributes.author,
          type: attributes.type,
        });

        console.log(
          `[TreeProcessor] Processing document: "${title}" at parse level ${parseLevel}`,
        );
        console.log(
          `[TreeProcessor] Found ${sections.length} top-level sections`,
        );

        // Extract content segments from original text based on parse level
        const contentSegments = extractContentSegments(
          originalContent,
          sections,
          parseLevel,
        );
        console.log(
          `[TreeProcessor] Extracted ${contentSegments.length} content segments for level ${parseLevel}`,
        );

        // Determine content type based on structure
        const contentType = detectContentType(title, contentSegments);
        console.log(`[TreeProcessor] Detected content type: ${contentType}`);

        // Build events and tree structure
        const { tree, indexEvent, contentEvents, eventStructure } =
          buildEventsFromSegments(
            contentSegments,
            title,
            attributes,
            contentType,
            parseLevel,
            ndk,
          );

        processorResult = {
          tree,
          indexEvent,
          contentEvents,
          metadata: {
            title,
            totalSections: contentSegments.length,
            contentType,
            attributes,
            parseLevel,
            eventStructure,
          },
        };

        console.log(
          `[TreeProcessor] Built tree with ${contentEvents.length} content events and ${indexEvent ? "1" : "0"} index events`,
        );
      } catch (error) {
        console.error("[TreeProcessor] Error processing document:", error);
        processorResult = null;
      }

      return doc;
    });
  });

  return {
    getResult: () => processorResult,
  };
}

/**
 * Extract content segments from original text based on parse level
 * This is the core iterative function that handles different hierarchy depths
 */
function extractContentSegments(
  originalContent: string,
  sections: any[],
  parseLevel: number,
): ContentSegment[] {
  const lines = originalContent.split("\n");

  // Build hierarchy map from AST
  const sectionHierarchy = buildSectionHierarchy(sections);

  // Debug: Show hierarchy depths
  function showDepth(nodes: SectionNode[], depth = 0) {
    for (const node of nodes) {
      console.log(`${"  ".repeat(depth)}Level ${node.level}: ${node.title}`);
      if (node.children.length > 0) {
        showDepth(node.children, depth + 1);
      }
    }
  }
  if (DEBUG) {
    showDepth(sectionHierarchy);
  }

  // Extract segments at the target parse level
  return extractSegmentsAtLevel(lines, sectionHierarchy, parseLevel);
}

/**
 * Build hierarchical section structure from Asciidoctor AST
 */
function buildSectionHierarchy(sections: any[]): SectionNode[] {
  function buildNode(section: any): SectionNode {
    return {
      title: section.getTitle(),
      level: section.getLevel() + 1, // Convert to app level (Asciidoctor uses 0-based)
      attributes: section.getAttributes() || {},
      children: (section.getSections() || []).map(buildNode),
    };
  }

  return sections.map(buildNode);
}

interface SectionNode {
  title: string;
  level: number;
  attributes: Record<string, string>;
  children: SectionNode[];
}

/**
 * Extract content segments at the specified parse level
 * This implements the iterative parsing logic for different levels
 */
function extractSegmentsAtLevel(
  lines: string[],
  hierarchy: SectionNode[],
  parseLevel: number,
): ContentSegment[] {
  const segments: ContentSegment[] = [];

  // Collect all sections at the target parse level
  const targetSections = collectSectionsAtLevel(hierarchy, parseLevel);

  for (const section of targetSections) {
    const segment = extractSegmentContent(lines, section, parseLevel);
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
}

/**
 * Recursively collect sections at or above the specified level
 * NKBIP-01: Level N parsing includes sections from level 2 through level N
 */
function collectSectionsAtLevel(
  hierarchy: SectionNode[],
  targetLevel: number,
): SectionNode[] {
  const collected: SectionNode[] = [];

  function traverse(nodes: SectionNode[]) {
    for (const node of nodes) {
      // Include sections from level 2 up to target level
      if (node.level >= 2 && node.level <= targetLevel) {
        collected.push(node);
      }

      // Continue traversing children to find more sections
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(hierarchy);
  return collected;
}

/**
 * Extract content for a specific section from the original text
 */
function extractSegmentContent(
  lines: string[],
  section: SectionNode,
  parseLevel: number,
): ContentSegment | null {
  // Find the section header in the original content
  const sectionPattern = new RegExp(
    `^${"=".repeat(section.level)}\\s+${escapeRegex(section.title)}`,
  );
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (sectionPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    console.warn(
      `[TreeProcessor] Could not find section "${section.title}" at level ${section.level}`,
    );
    return null;
  }

  // Find the end of this section
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const levelMatch = lines[i].match(/^(=+)\s+/);
    if (levelMatch && levelMatch[1].length <= section.level) {
      endIdx = i;
      break;
    }
  }

  // Extract section content
  const sectionLines = lines.slice(startIdx, endIdx);

  // Parse attributes and content
  const { attributes, content } = parseSegmentContent(sectionLines, parseLevel);

  return {
    title: section.title,
    content,
    level: section.level,
    attributes,
    startLine: startIdx,
    endLine: endIdx,
  };
}

/**
 * Parse attributes and content from section lines
 */
function parseSegmentContent(
  sectionLines: string[],
  parseLevel: number,
): {
  attributes: Record<string, string>;
  content: string;
} {
  const attributes: Record<string, string> = {};
  let contentStartIdx = 1; // Skip the title line

  // Look for attribute lines after the title
  for (let i = 1; i < sectionLines.length; i++) {
    const line = sectionLines[i].trim();
    if (line.startsWith(":") && line.includes(":")) {
      const match = line.match(/^:([^:]+):\\s*(.*)$/);
      if (match) {
        attributes[match[1]] = match[2];
        contentStartIdx = i + 1;
      }
    } else if (line !== "") {
      // Non-empty, non-attribute line - content starts here
      break;
    }
  }

  // Extract content (everything after attributes)
  const content = sectionLines.slice(contentStartIdx).join("\n").trim();

  return { attributes, content };
}

/**
 * Detect content type based on document structure
 */
function detectContentType(
  title: string,
  segments: ContentSegment[],
): "article" | "scattered-notes" | "none" {
  const hasDocTitle = !!title;
  const hasSections = segments.length > 0;

  // Check if the title matches the first section title
  const titleMatchesFirstSection =
    segments.length > 0 && title === segments[0].title;

  if (hasDocTitle && hasSections && !titleMatchesFirstSection) {
    return "article";
  } else if (hasSections) {
    return "scattered-notes";
  }

  return "none";
}

/**
 * Build events and tree structure from content segments
 * Implements NKBIP-01 hierarchical parsing:
 * - Level 2: One 30041 event per level 2 section containing all nested content
 * - Level 3+: Hierarchical 30040 events for intermediate sections + 30041 for content-only
 */
function buildEventsFromSegments(
  segments: ContentSegment[],
  title: string,
  attributes: Record<string, string>,
  contentType: "article" | "scattered-notes" | "none",
  parseLevel: number,
  ndk: NDK,
): {
  tree: PublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  eventStructure: EventStructureNode[];
} {
  if (contentType === "scattered-notes" && segments.length > 0) {
    return buildScatteredNotesStructure(segments, ndk);
  }

  if (contentType === "article" && title) {
    return buildArticleStructure(segments, title, attributes, parseLevel, ndk);
  }

  throw new Error("No valid content found to create publication tree");
}

/**
 * Build structure for scattered notes (flat 30041 events)
 */
function buildScatteredNotesStructure(
  segments: ContentSegment[],
  ndk: NDK,
): {
  tree: PublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  eventStructure: EventStructureNode[];
} {
  const contentEvents: NDKEvent[] = [];
  const eventStructure: EventStructureNode[] = [];

  const firstSegment = segments[0];
  const rootEvent = createContentEvent(firstSegment, ndk);
  const tree = new PublicationTree(rootEvent, ndk);
  contentEvents.push(rootEvent);

  eventStructure.push({
    title: firstSegment.title,
    level: firstSegment.level,
    eventType: "content",
    eventKind: 30041,
    dTag: generateDTag(firstSegment.title),
    children: [],
  });

  // Add remaining segments
  for (let i = 1; i < segments.length; i++) {
    const contentEvent = createContentEvent(segments[i], ndk);
    contentEvents.push(contentEvent);

    eventStructure.push({
      title: segments[i].title,
      level: segments[i].level,
      eventType: "content",
      eventKind: 30041,
      dTag: generateDTag(segments[i].title),
      children: [],
    });
  }

  return { tree, indexEvent: null, contentEvents, eventStructure };
}

/**
 * Build structure for articles based on parse level
 */
function buildArticleStructure(
  segments: ContentSegment[],
  title: string,
  attributes: Record<string, string>,
  parseLevel: number,
  ndk: NDK,
): {
  tree: PublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  eventStructure: EventStructureNode[];
} {
  const indexEvent = createIndexEvent(title, attributes, segments, ndk);
  const tree = new PublicationTree(indexEvent, ndk);

  if (parseLevel === 2) {
    return buildLevel2Structure(segments, title, indexEvent, tree, ndk);
  } else {
    return buildHierarchicalStructure(
      segments,
      title,
      indexEvent,
      tree,
      parseLevel,
      ndk,
    );
  }
}

/**
 * Build Level 2 structure: One 30041 event per level 2 section with all nested content
 */
function buildLevel2Structure(
  segments: ContentSegment[],
  title: string,
  indexEvent: NDKEvent,
  tree: PublicationTree,
  ndk: NDK,
): {
  tree: PublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  eventStructure: EventStructureNode[];
} {
  const contentEvents: NDKEvent[] = [];
  const eventStructure: EventStructureNode[] = [];

  // Add index to structure
  eventStructure.push({
    title,
    level: 1,
    eventType: "index",
    eventKind: 30040,
    dTag: generateDTag(title),
    children: [],
  });

  // Group segments by level 2 sections
  const level2Groups = groupSegmentsByLevel2(segments);

  for (const group of level2Groups) {
    const contentEvent = createContentEvent(group, ndk);
    contentEvents.push(contentEvent);

    eventStructure[0].children.push({
      title: group.title,
      level: group.level,
      eventType: "content",
      eventKind: 30041,
      dTag: generateDTag(group.title),
      children: [],
    });
  }

  return { tree, indexEvent, contentEvents, eventStructure };
}

/**
 * Build hierarchical structure for Level 3+: Mix of 30040 and 30041 events
 */
function buildHierarchicalStructure(
  segments: ContentSegment[],
  title: string,
  indexEvent: NDKEvent,
  tree: PublicationTree,
  parseLevel: number,
  ndk: NDK,
): {
  tree: PublicationTree;
  indexEvent: NDKEvent | null;
  contentEvents: NDKEvent[];
  eventStructure: EventStructureNode[];
} {
  const contentEvents: NDKEvent[] = [];
  const eventStructure: EventStructureNode[] = [];

  // Add root index to structure
  eventStructure.push({
    title,
    level: 1,
    eventType: "index",
    eventKind: 30040,
    dTag: generateDTag(title),
    children: [],
  });

  // Build hierarchical structure
  const hierarchy = buildSegmentHierarchy(segments);

  for (const level2Section of hierarchy) {
    if (level2Section.hasChildren) {
      // Create 30040 for level 2 section with children
      const level2Index = createIndexEventForSection(level2Section, ndk);
      contentEvents.push(level2Index);

      const level2Node: EventStructureNode = {
        title: level2Section.title,
        level: level2Section.level,
        eventType: "index",
        eventKind: 30040,
        dTag: generateDTag(level2Section.title),
        children: [],
      };

      // Add children as 30041 content events
      for (const child of level2Section.children) {
        const childEvent = createContentEvent(child, ndk);
        contentEvents.push(childEvent);

        level2Node.children.push({
          title: child.title,
          level: child.level,
          eventType: "content",
          eventKind: 30041,
          dTag: generateDTag(child.title),
          children: [],
        });
      }

      eventStructure[0].children.push(level2Node);
    } else {
      // Create 30041 for level 2 section without children
      const contentEvent = createContentEvent(level2Section, ndk);
      contentEvents.push(contentEvent);

      eventStructure[0].children.push({
        title: level2Section.title,
        level: level2Section.level,
        eventType: "content",
        eventKind: 30041,
        dTag: generateDTag(level2Section.title),
        children: [],
      });
    }
  }

  return { tree, indexEvent, contentEvents, eventStructure };
}

/**
 * Create a 30040 index event from document metadata
 */
function createIndexEvent(
  title: string,
  attributes: Record<string, string>,
  segments: ContentSegment[],
  ndk: NDK,
): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30040;
  event.created_at = Math.floor(Date.now() / 1000);
  event.pubkey = ndk.activeUser?.pubkey || "preview-placeholder-pubkey";

  const dTag = generateDTag(title);
  const [mTag, MTag] = getMimeTags(30040);

  const tags: string[][] = [["d", dTag], mTag, MTag, ["title", title]];

  // Add document attributes as tags
  addDocumentAttributesToTags(tags, attributes, event.pubkey);

  // Add a-tags for each content section
  segments.forEach((segment) => {
    const sectionDTag = generateDTag(segment.title);
    tags.push(["a", `30041:${event.pubkey}:${sectionDTag}`]);
  });

  event.tags = tags;
  console.log(`[TreeProcessor] Index event tags:`, tags.slice(0, 10));
  // NKBIP-01: Index events must have empty content
  event.content = "";

  return event;
}

/**
 * Create a 30041 content event from segment
 */
function createContentEvent(segment: ContentSegment, ndk: NDK): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30041;
  event.created_at = Math.floor(Date.now() / 1000);
  event.pubkey = ndk.activeUser?.pubkey || "preview-placeholder-pubkey";

  const dTag = generateDTag(segment.title);
  const [mTag, MTag] = getMimeTags(30041);

  const tags: string[][] = [["d", dTag], mTag, MTag, ["title", segment.title]];

  // Add segment attributes as tags
  addSectionAttributesToTags(tags, segment.attributes);

  event.tags = tags;
  event.content = segment.content;

  return event;
}

/**
 * Generate default index content
 */
function generateIndexContent(
  title: string,
  segments: ContentSegment[],
): string {
  return `# ${title}

${segments.length} sections available:

${segments.map((segment, i) => `${i + 1}. ${segment.title}`).join("\n")}`;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  if (attributes.type) tags.push(["type", attributes.type]);

  // Tags
  if (attributes.tags) {
    attributes.tags.split(",").forEach((tag) => tags.push(["t", tag.trim()]));
  }

  // Add pubkey reference
  tags.push(["p", pubkey]);

  // Custom attributes
  addCustomAttributes(tags, attributes);
}

/**
 * Add section attributes as tags
 */
function addSectionAttributesToTags(
  tags: string[][],
  attributes: Record<string, string>,
) {
  // Section tags
  if (attributes.tags) {
    attributes.tags.split(",").forEach((tag) => tags.push(["t", tag.trim()]));
  }

  // Custom attributes
  addCustomAttributes(tags, attributes);
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
 * Group segments by level 2 sections for Level 2 parsing
 * Combines all nested content into each level 2 section
 */
function groupSegmentsByLevel2(segments: ContentSegment[]): ContentSegment[] {
  const level2Groups: ContentSegment[] = [];

  // Find all level 2 segments and include their nested content
  for (const segment of segments) {
    if (segment.level === 2) {
      // Find all content that belongs to this level 2 section
      const nestedSegments = segments.filter(
        (s) =>
          s.level > 2 &&
          s.startLine > segment.startLine &&
          (segments.find(
            (next) => next.level <= 2 && next.startLine > segment.startLine,
          )?.startLine || Infinity) > s.startLine,
      );

      // Combine the level 2 content with all nested content
      let combinedContent = segment.content;
      for (const nested of nestedSegments) {
        combinedContent += `\n\n${"=".repeat(nested.level)} ${nested.title}\n${nested.content}`;
      }

      level2Groups.push({
        ...segment,
        content: combinedContent,
      });
    }
  }

  return level2Groups;
}

/**
 * Build hierarchical segment structure for Level 3+ parsing
 */
function buildSegmentHierarchy(
  segments: ContentSegment[],
): HierarchicalSegment[] {
  const hierarchy: HierarchicalSegment[] = [];

  // Process level 2 sections
  for (const level2Segment of segments.filter((s) => s.level === 2)) {
    const children = segments.filter(
      (s) =>
        s.level > 2 &&
        s.startLine > level2Segment.startLine &&
        (segments.find(
          (next) => next.level <= 2 && next.startLine > level2Segment.startLine,
        )?.startLine || Infinity) > s.startLine,
    );

    hierarchy.push({
      ...level2Segment,
      hasChildren: children.length > 0,
      children,
    });
  }

  return hierarchy;
}

/**
 * Create a 30040 index event for a section with children
 */
function createIndexEventForSection(
  section: HierarchicalSegment,
  ndk: NDK,
): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30040;
  event.created_at = Math.floor(Date.now() / 1000);
  event.pubkey = ndk.activeUser?.pubkey || "preview-placeholder-pubkey";

  const dTag = generateDTag(section.title);
  const [mTag, MTag] = getMimeTags(30040);

  const tags: string[][] = [["d", dTag], mTag, MTag, ["title", section.title]];

  // Add section attributes as tags
  addSectionAttributesToTags(tags, section.attributes);

  // Add a-tags for each child content section
  section.children.forEach((child) => {
    const childDTag = generateDTag(child.title);
    tags.push(["a", `30041:${event.pubkey}:${childDTag}`]);
  });

  event.tags = tags;
  // NKBIP-01: Index events must have empty content
  event.content = "";

  return event;
}
