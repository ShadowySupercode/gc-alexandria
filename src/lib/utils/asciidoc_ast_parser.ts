/**
 * AST-based AsciiDoc parsing using Asciidoctor's native document structure
 * 
 * This replaces the manual regex parsing in asciidoc_metadata.ts with proper
 * AST traversal, leveraging Asciidoctor's built-in parsing capabilities.
 */

import Processor from "asciidoctor";
import type { Document } from "asciidoctor";
import { PublicationTree } from "../data_structures/publication_tree.ts";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { getMimeTags } from "./mime.ts";

export interface ASTSection {
  title: string;
  content: string;
  level: number;
  attributes: Record<string, string>;
  subsections: ASTSection[];
}

export interface ASTParsedDocument {
  title: string;
  content: string;
  attributes: Record<string, string>;
  sections: ASTSection[];
}

/**
 * Parse AsciiDoc content using Asciidoctor's AST instead of manual regex
 */
export function parseAsciiDocAST(content: string, parseLevel: number = 2): ASTParsedDocument {
  const asciidoctor = Processor();
  const document = asciidoctor.load(content, { standalone: false }) as Document;
  
  return {
    title: document.getTitle() || '',
    content: document.getContent() || '',
    attributes: document.getAttributes(),
    sections: extractSectionsFromAST(document, parseLevel)
  };
}

/**
 * Extract sections from Asciidoctor AST based on parse level
 */
function extractSectionsFromAST(document: Document, parseLevel: number): ASTSection[] {
  const directSections = document.getSections();
  
  // Collect all sections at all levels up to parseLevel
  const allSections: ASTSection[] = [];
  
  function collectSections(sections: any[]) {
    for (const section of sections) {
      const asciidoctorLevel = section.getLevel();
      // Convert Asciidoctor's internal level to our application level
      // Asciidoctor: == is level 1, === is level 2, etc.
      // Our app: == is level 2, === is level 3, etc.
      const appLevel = asciidoctorLevel + 1;
      
      if (appLevel <= parseLevel) {
        allSections.push({
          title: section.getTitle() || '',
          content: section.getContent() || '',
          level: appLevel,
          attributes: section.getAttributes() || {},
          subsections: []
        });
      }
      
      // Recursively collect subsections
      const subsections = section.getSections?.() || [];
      if (subsections.length > 0) {
        collectSections(subsections);
      }
    }
  }
  
  collectSections(directSections);
  
  return allSections;
}

/**
 * Extract subsections from a section (recursive helper)
 */
function extractSubsections(section: any, parseLevel: number): ASTSection[] {
  const subsections = section.getSections?.() || [];
  
  return subsections
    .filter((sub: any) => (sub.getLevel() + 1) <= parseLevel)
    .map((sub: any) => ({
      title: sub.getTitle() || '',
      content: sub.getContent() || '',
      level: sub.getLevel() + 1, // Convert to app level
      attributes: sub.getAttributes() || {},
      subsections: extractSubsections(sub, parseLevel)
    }));
}

/**
 * Create a PublicationTree directly from Asciidoctor AST
 * This integrates with Michael's PublicationTree architecture
 */
export async function createPublicationTreeFromAST(
  content: string, 
  ndk: NDK, 
  parseLevel: number = 2
): Promise<PublicationTree> {
  const parsed = parseAsciiDocAST(content, parseLevel);
  
  // Create root 30040 index event from document metadata
  const rootEvent = createIndexEventFromAST(parsed, ndk);
  const tree = new PublicationTree(rootEvent, ndk);
  
  // Add sections as 30041 events
  for (const section of parsed.sections) {
    const contentEvent = createContentEventFromSection(section, ndk);
    await tree.addEvent(contentEvent, rootEvent);
  }
  
  return tree;
}

/**
 * Create a 30040 index event from AST document metadata
 */
function createIndexEventFromAST(parsed: ASTParsedDocument, ndk: NDK): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30040;
  event.created_at = Math.floor(Date.now() / 1000);
  
  // Generate d-tag from title
  const dTag = generateDTag(parsed.title);
  const [mTag, MTag] = getMimeTags(30040);
  
  const tags: string[][] = [
    ["d", dTag],
    mTag,
    MTag,
    ["title", parsed.title]
  ];
  
  // Add document attributes as tags
  addAttributesAsTags(tags, parsed.attributes);
  
  // Add a-tags for each section (30041 content events)
  parsed.sections.forEach(section => {
    const sectionDTag = generateDTag(section.title);
    tags.push(["a", `30041:${ndk.activeUser?.pubkey || 'pubkey'}:${sectionDTag}`]);
  });
  
  event.tags = tags;
  event.content = parsed.content;
  
  return event;
}

/**
 * Create a 30041 content event from an AST section
 */
function createContentEventFromSection(section: ASTSection, ndk: NDK): NDKEvent {
  const event = new NDKEvent(ndk);
  event.kind = 30041;
  event.created_at = Math.floor(Date.now() / 1000);
  
  const dTag = generateDTag(section.title);
  const [mTag, MTag] = getMimeTags(30041);
  
  const tags: string[][] = [
    ["d", dTag],
    mTag,
    MTag,
    ["title", section.title]
  ];
  
  // Add section attributes as tags
  addAttributesAsTags(tags, section.attributes);
  
  event.tags = tags;
  event.content = section.content;
  
  return event;
}

/**
 * Generate a deterministic d-tag from title
 */
function generateDTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Add AsciiDoc attributes as Nostr event tags, filtering out system attributes
 */
function addAttributesAsTags(tags: string[][], attributes: Record<string, string>) {
  const systemAttributes = [
    'attribute-undefined', 'attribute-missing', 'appendix-caption', 'appendix-refsig',
    'caution-caption', 'chapter-refsig', 'example-caption', 'figure-caption',
    'important-caption', 'last-update-label', 'manname-title', 'note-caption',
    'part-refsig', 'preface-title', 'section-refsig', 'table-caption',
    'tip-caption', 'toc-title', 'untitled-label', 'version-label', 'warning-caption',
    'asciidoctor', 'asciidoctor-version', 'safe-mode-name', 'backend', 'doctype',
    'basebackend', 'filetype', 'outfilesuffix', 'stylesdir', 'iconsdir',
    'localdate', 'localyear', 'localtime', 'localdatetime', 'docdate',
    'docyear', 'doctime', 'docdatetime', 'doctitle', 'embedded', 'notitle'
  ];
  
  // Add standard metadata tags
  if (attributes.author) tags.push(["author", attributes.author]);
  if (attributes.version) tags.push(["version", attributes.version]);
  if (attributes.description) tags.push(["summary", attributes.description]);
  if (attributes.tags) {
    attributes.tags.split(',').forEach(tag => 
      tags.push(["t", tag.trim()])
    );
  }
  
  // Add custom attributes (non-system)
  Object.entries(attributes).forEach(([key, value]) => {
    if (!systemAttributes.includes(key) && value) {
      tags.push([key, value]);
    }
  });
}

/**
 * Tree processor extension for Asciidoctor
 * This can be registered to automatically populate PublicationTree during parsing
 */
export function createPublicationTreeProcessor(ndk: NDK, parseLevel: number = 2) {
  return function(extensions: any) {
    extensions.treeProcessor(function(this: any) {
      const dsl = this;
      dsl.process(function(this: any, document: Document) {
        // Create PublicationTree and store on document for later retrieval
        const publicationTree = createPublicationTreeFromDocument(document, ndk, parseLevel);
        document.setAttribute('publicationTree', publicationTree);
      });
    });
  };
}

/**
 * Helper function to create PublicationTree from Asciidoctor Document
 */
async function createPublicationTreeFromDocument(
  document: Document, 
  ndk: NDK, 
  parseLevel: number
): Promise<PublicationTree> {
  const parsed: ASTParsedDocument = {
    title: document.getTitle() || '',
    content: document.getContent() || '',
    attributes: document.getAttributes(),
    sections: extractSectionsFromAST(document, parseLevel)
  };
  
  const rootEvent = createIndexEventFromAST(parsed, ndk);
  const tree = new PublicationTree(rootEvent, ndk);
  
  for (const section of parsed.sections) {
    const contentEvent = createContentEventFromSection(section, ndk);
    await tree.addEvent(contentEvent, rootEvent);
  }
  
  return tree;
}