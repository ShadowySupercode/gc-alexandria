/**
 * AsciiDoc Content Parsing Service
 *
 * Handles parsing AsciiDoc content into hierarchical structures for publication.
 * Separated from metadata extraction to maintain single responsibility principle.
 */

// @ts-ignore
import Processor from "asciidoctor";
import type { Document } from "asciidoctor";
import {
  extractDocumentMetadata,
  extractSectionMetadata,
  parseSimpleAttributes,
} from "./asciidoc_metadata.ts";

export interface ParsedAsciiDoc {
  metadata: {
    title?: string;
    authors?: string[];
    version?: string;
    edition?: string;
    publicationDate?: string;
    publisher?: string;
    summary?: string;
    coverImage?: string;
    isbn?: string;
    tags?: string[];
    source?: string;
    publishedBy?: string;
    type?: string;
    autoUpdate?: "yes" | "ask" | "no";
    customAttributes?: Record<string, string>;
  };
  content: string;
  title: string;
  sections: Array<{
    metadata: {
      title?: string;
      authors?: string[];
      version?: string;
      edition?: string;
      publicationDate?: string;
      publisher?: string;
      summary?: string;
      coverImage?: string;
      isbn?: string;
      tags?: string[];
      source?: string;
      publishedBy?: string;
      type?: string;
      autoUpdate?: "yes" | "ask" | "no";
      customAttributes?: Record<string, string>;
    };
    content: string;
    title: string;
  }>;
}

/**
 * Creates an Asciidoctor processor instance
 */
function createProcessor() {
  return Processor();
}

/**
 * Helper function to determine the header level of a section
 */
function getSectionLevel(sectionContent: string): number {
  const lines = sectionContent.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(=+)\s+/);
    if (match) {
      return match[1].length;
    }
  }
  return 0;
}

/**
 * Helper function to extract just the intro content (before first subsection)
 */
function extractIntroContent(
  sectionContent: string,
  currentLevel: number,
): string {
  const lines = sectionContent.split(/\r?\n/);
  const introLines: string[] = [];
  let foundHeader = false;

  for (const line of lines) {
    const headerMatch = line.match(/^(=+)\s+/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      if (level === currentLevel && !foundHeader) {
        // This is the section header itself
        foundHeader = true;
        continue; // Skip the header line itself for intro content
      } else if (level > currentLevel) {
        // This is a subsection, stop collecting intro content
        break;
      }
    } else if (foundHeader) {
      // This is intro content after the header
      introLines.push(line);
    }
  }

  return introLines.join("\n").trim();
}

/**
 * Parses AsciiDoc content into sections with metadata
 */
export function parseAsciiDocWithMetadata(content: string): ParsedAsciiDoc {
  const asciidoctor = createProcessor();
  const document = asciidoctor.load(content, { standalone: false }) as Document;
  const { metadata: docMetadata } = extractDocumentMetadata(content);

  // Parse the original content to find section attributes
  const lines = content.split(/\r?\n/);
  const sectionsWithMetadata: Array<{
    metadata: ParsedAsciiDoc["sections"][0]["metadata"];
    content: string;
    title: string;
  }> = [];
  let currentSection: string | null = null;
  let currentSectionContent: string[] = [];

  for (const line of lines) {
    if (line.match(/^==\s+/)) {
      // Save previous section if exists
      if (currentSection) {
        const sectionContent = currentSectionContent.join("\n");
        sectionsWithMetadata.push(extractSectionMetadata(sectionContent));
      }

      // Start new section
      currentSection = line;
      currentSectionContent = [line];
    } else if (currentSection) {
      currentSectionContent.push(line);
    }
  }

  // Save the last section
  if (currentSection) {
    const sectionContent = currentSectionContent.join("\n");
    sectionsWithMetadata.push(extractSectionMetadata(sectionContent));
  }

  return {
    metadata: docMetadata,
    content: document.getSource(),
    title: docMetadata.title || "",
    sections: sectionsWithMetadata,
  };
}

/**
 * Iterative AsciiDoc parsing based on specified level
 * Level 2: Only == sections become content events (containing all subsections)
 * Level 3: == sections become indices + content events, === sections become content events
 * Level 4: === sections become indices + content events, ==== sections become content events, etc.
 */
export function parseAsciiDocIterative(
  content: string,
  parseLevel: number = 2,
): ParsedAsciiDoc {
  const asciidoctor = createProcessor();
  const document = asciidoctor.load(content, { standalone: false }) as Document;

  // Extract document metadata using the metadata extraction functions
  const { metadata: docMetadata } = extractDocumentMetadata(content);

  const lines = content.split(/\r?\n/);
  const sections: Array<{
    metadata: ParsedAsciiDoc["sections"][0]["metadata"];
    content: string;
    title: string;
  }> = [];

  if (parseLevel === 2) {
    // Level 2: Only == sections become events
    const level2Pattern = /^==\s+/;
    let currentSection: string | null = null;
    let currentSectionContent: string[] = [];
    let documentContent: string[] = [];
    let inDocumentHeader = true;

    for (const line of lines) {
      if (line.match(level2Pattern)) {
        inDocumentHeader = false;

        // Save previous section if exists
        if (currentSection) {
          const sectionContent = currentSectionContent.join("\n");
          const sectionMeta = extractSectionMetadata(sectionContent);
          // For level 2, preserve the full content including the header
          sections.push({
            ...sectionMeta,
            content: sectionContent, // Use full content, not stripped
          });
        }

        // Start new section
        currentSection = line;
        currentSectionContent = [line];
      } else if (currentSection) {
        currentSectionContent.push(line);
      } else if (inDocumentHeader) {
        documentContent.push(line);
      }
    }

    // Save the last section
    if (currentSection) {
      const sectionContent = currentSectionContent.join("\n");
      const sectionMeta = extractSectionMetadata(sectionContent);
      // For level 2, preserve the full content including the header
      sections.push({
        ...sectionMeta,
        content: sectionContent, // Use full content, not stripped
      });
    }

    const docContent = documentContent.join("\n");
    return {
      metadata: docMetadata,
      content: docContent,
      title: docMetadata.title || "",
      sections: sections,
    };
  }

  // Level 3+: Parse hierarchically
  // All levels from 2 to parseLevel-1 are indices (title only)
  // Level parseLevel are content sections (full content)

  // First, collect all sections at the content level (parseLevel)
  const contentLevelPattern = new RegExp(`^${"=".repeat(parseLevel)}\\s+`);
  let currentSection: string | null = null;
  let currentSectionContent: string[] = [];
  let documentContent: string[] = [];
  let inDocumentHeader = true;

  for (const line of lines) {
    if (line.match(contentLevelPattern)) {
      inDocumentHeader = false;

      // Save previous section if exists
      if (currentSection) {
        const sectionContent = currentSectionContent.join("\n");
        const sectionMeta = extractSectionMetadata(sectionContent);
        sections.push({
          ...sectionMeta,
          content: sectionContent, // Full content including headers
        });
      }

      // Start new content section
      currentSection = line;
      currentSectionContent = [line];
    } else if (currentSection) {
      // Continue collecting content for current section
      currentSectionContent.push(line);
    } else if (inDocumentHeader) {
      documentContent.push(line);
    }
  }

  // Save the last section
  if (currentSection) {
    const sectionContent = currentSectionContent.join("\n");
    const sectionMeta = extractSectionMetadata(sectionContent);
    sections.push({
      ...sectionMeta,
      content: sectionContent, // Full content including headers
    });
  }

  // Now collect index sections (all levels from 2 to parseLevel-1)
  // These should be shown as navigation/structure but not full content
  const indexSections: Array<{
    metadata: ParsedAsciiDoc["sections"][0]["metadata"];
    content: string;
    title: string;
    level: number;
  }> = [];

  for (let level = 2; level < parseLevel; level++) {
    const levelPattern = new RegExp(`^${"=".repeat(level)}\\s+(.+)$`, "gm");
    const matches = content.matchAll(levelPattern);

    for (const match of matches) {
      const title = match[1].trim();
      indexSections.push({
        metadata: { title },
        content: `${"=".repeat(level)} ${title}`, // Just the header line for index sections
        title,
        level,
      });
    }
  }

  // Add actual level to content sections based on their content
  const contentSectionsWithLevel = sections.map((s) => ({
    ...s,
    level: getSectionLevel(s.content),
  }));

  // Combine index sections and content sections
  // Sort by position in original content to maintain order
  const allSections = [...indexSections, ...contentSectionsWithLevel];

  // Sort sections by their appearance in the original content
  allSections.sort((a, b) => {
    const posA = content.indexOf(a.content.split("\n")[0]);
    const posB = content.indexOf(b.content.split("\n")[0]);
    return posA - posB;
  });

  const docContent = documentContent.join("\n");
  return {
    metadata: docMetadata,
    content: docContent,
    title: docMetadata.title || "",
    sections: allSections,
  };
}

/**
 * Generates Nostr events from parsed AsciiDoc with proper hierarchical structure
 * Based on docreference.md specifications
 */
export function generateNostrEvents(
  parsed: ParsedAsciiDoc,
  parseLevel: number = 2,
  pubkey?: string,
  maxDepth: number = 6,
): {
  indexEvent?: any;
  contentEvents: any[];
} {
  const allEvents: any[] = [];
  const actualPubkey = pubkey || "pubkey";

  // Helper function to generate section ID
  const generateSectionId = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // Build hierarchical tree structure
  interface TreeNode {
    section: {
      metadata: any;
      content: string;
      title: string;
    };
    level: number;
    sectionId: string;
    tags: [string, string][];
    children: TreeNode[];
    parent?: TreeNode;
  }

  // Convert flat sections to tree structure
  const buildTree = (): TreeNode[] => {
    const roots: TreeNode[] = [];
    const stack: TreeNode[] = [];

    for (const section of parsed.sections) {
      const level = getSectionLevel(section.content);
      const sectionId = generateSectionId(section.title);
      const tags = parseSimpleAttributes(section.content);

      const node: TreeNode = {
        section,
        level,
        sectionId,
        tags,
        children: [],
      };

      // Find the correct parent based on header hierarchy
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        // This is a root level section
        roots.push(node);
      } else {
        // This is a child of the last item in stack
        const parent = stack[stack.length - 1];
        parent.children.push(node);
        node.parent = parent;
      }

      stack.push(node);
    }

    return roots;
  };

  const tree = buildTree();

  // Recursively create events from tree
  const createEventsFromNode = (node: TreeNode): void => {
    const { section, level, sectionId, tags, children } = node;

    // Determine if this node should become an index
    const hasChildrenAtTargetLevel = children.some(
      (child) => child.level === parseLevel,
    );
    const shouldBeIndex = level < parseLevel &&
      (hasChildrenAtTargetLevel ||
        children.some((child) => child.level <= parseLevel));

    if (shouldBeIndex) {
      // Create content event for intro text (30041)
      const introContent = extractIntroContent(section.content, level);
      if (introContent.trim()) {
        const contentEvent = {
          id: "",
          pubkey: "",
          created_at: Math.floor(Date.now() / 1000),
          kind: 30041,
          tags: [
            ["d", `${sectionId}-content`],
            ["title", section.title],
            ...tags,
          ],
          content: introContent,
          sig: "",
        };
        allEvents.push(contentEvent);
      }

      // Create index event (30040)
      const childATags: string[][] = [];

      // Add a-tag for intro content if it exists
      if (introContent.trim()) {
        childATags.push([
          "a",
          `30041:${actualPubkey}:${sectionId}-content`,
          "",
          "",
        ]);
      }

      // Add a-tags for direct children
      for (const child of children) {
        const childHasSubChildren = child.children.some(
          (grandchild) => grandchild.level <= parseLevel,
        );
        const childShouldBeIndex = child.level < parseLevel &&
          childHasSubChildren;
        const childKind = childShouldBeIndex ? 30040 : 30041;
        childATags.push([
          "a",
          `${childKind}:${actualPubkey}:${child.sectionId}`,
          "",
          "",
        ]);
      }

      const indexEvent = {
        id: "",
        pubkey: "",
        created_at: Math.floor(Date.now() / 1000),
        kind: 30040,
        tags: [
          ["d", sectionId],
          ["title", section.title],
          ...tags,
          ...childATags,
        ],
        content: "",
        sig: "",
      };
      allEvents.push(indexEvent);
    } else {
      // Create regular content event (30041)
      const contentEvent = {
        id: "",
        pubkey: "",
        created_at: Math.floor(Date.now() / 1000),
        kind: 30041,
        tags: [["d", sectionId], ["title", section.title], ...tags],
        content: section.content,
        sig: "",
      };
      allEvents.push(contentEvent);
    }

    // Recursively process children
    for (const child of children) {
      createEventsFromNode(child);
    }
  };

  // Process all root level sections
  for (const rootNode of tree) {
    createEventsFromNode(rootNode);
  }

  // Create main document index if we have a document title (article format)
  if (parsed.title && parsed.title.trim() !== "") {
    const documentId = generateSectionId(parsed.title);
    const documentTags = parseSimpleAttributes(parsed.content);

    // Create a-tags for all root level sections (level 2)
    const mainIndexATags = tree.map((rootNode) => {
      const hasSubChildren = rootNode.children.some(
        (child) => child.level <= parseLevel,
      );
      const shouldBeIndex = rootNode.level < parseLevel && hasSubChildren;
      const kind = shouldBeIndex ? 30040 : 30041;
      return ["a", `${kind}:${actualPubkey}:${rootNode.sectionId}`, "", ""];
    });

    console.log("Debug: Root sections found:", tree.length);
    console.log("Debug: Main index a-tags:", mainIndexATags);

    const mainIndexEvent = {
      id: "",
      pubkey: "",
      created_at: Math.floor(Date.now() / 1000),
      kind: 30040,
      tags: [
        ["d", documentId],
        ["title", parsed.title],
        ...documentTags,
        ...mainIndexATags,
      ],
      content: "",
      sig: "",
    };

    return {
      indexEvent: mainIndexEvent,
      contentEvents: allEvents,
    };
  }

  // For scattered notes, return only content events
  return {
    contentEvents: allEvents,
  };
}

/**
 * Detects content type for smart publishing
 */
export function detectContentType(
  content: string,
): "article" | "scattered-notes" | "none" {
  const hasDocTitle = content.trim().startsWith("=") &&
    !content.trim().startsWith("==");
  const hasSections = content.includes("==");

  if (hasDocTitle) {
    return "article";
  } else if (hasSections) {
    return "scattered-notes";
  } else {
    return "none";
  }
}
