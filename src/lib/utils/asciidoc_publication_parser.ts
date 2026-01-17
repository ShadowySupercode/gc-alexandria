/**
 * Unified AsciiDoc Publication Parser
 *
 * Single entry point for parsing AsciiDoc content into NKBIP-01 compliant
 * publication trees using proper Asciidoctor tree processor extensions.
 *
 * This implements Michael's vision of using PublicationTree as the primary
 * data structure for organizing hierarchical Nostr events.
 */

import Asciidoctor from "asciidoctor";
import {
  type ProcessorResult,
  registerPublicationTreeProcessor,
} from "./publication_tree_processor";
import type NDK from "@nostr-dev-kit/ndk";

export type PublicationTreeResult = ProcessorResult;

/**
 * Parse AsciiDoc content into a PublicationTree using tree processor extension
 * This is the main entry point for all parsing operations
 */
export async function parseAsciiDocWithTree(
  content: string,
  ndk: NDK,
  parseLevel: number = 2,
): Promise<PublicationTreeResult> {
  console.log(`[Parser] Starting parse at level ${parseLevel}`);

  // Create fresh Asciidoctor instance
  const asciidoctor = Asciidoctor();
  const registry = asciidoctor.Extensions.create();

  // Register our tree processor extension
  const processorAccessor = registerPublicationTreeProcessor(
    registry,
    ndk,
    parseLevel,
    content,
  );

  try {
    // Parse the document with our extension
    const doc = asciidoctor.load(content, {
      extension_registry: registry,
      standalone: false,
      attributes: {
        sectids: false,
      },
    });

    console.log(`[Parser] Document converted successfully`);

    // Get the result from our processor
    const result = processorAccessor.getResult();

    if (!result) {
      throw new Error("Tree processor failed to generate result");
    }

    // Build async relationships in the PublicationTree
    await buildTreeRelationships(result);

    console.log(`[Parser] Tree relationships built successfully`);

    return result;
  } catch (error) {
    console.error("[Parser] Error during parsing:", error);
    throw new Error(
      `Failed to parse AsciiDoc content: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Build async relationships in the PublicationTree
 * This adds content events to the tree structure as Michael envisioned
 */
async function buildTreeRelationships(result: ProcessorResult): Promise<void> {
  const { tree, indexEvent, contentEvents } = result;

  if (!tree) {
    throw new Error("No tree available to build relationships");
  }

  try {
    // Add content events to the tree
    if (indexEvent && contentEvents.length > 0) {
      // Article structure: add all content events to index
      for (const contentEvent of contentEvents) {
        await tree.addEvent(contentEvent, indexEvent);
      }
    } else if (contentEvents.length > 1) {
      // Scattered notes: add remaining events to first event
      const rootEvent = contentEvents[0];
      for (let i = 1; i < contentEvents.length; i++) {
        await tree.addEvent(contentEvents[i], rootEvent);
      }
    }

    console.log(`[Parser] Added ${contentEvents.length} events to tree`);
  } catch (error) {
    console.error("[Parser] Error building tree relationships:", error);
    throw error;
  }
}

/**
 * Export events from PublicationTree for publishing workflow compatibility
 */
export function exportEventsFromTree(result: PublicationTreeResult) {
  return {
    indexEvent: result.indexEvent
      ? eventToPublishableObject(result.indexEvent)
      : undefined,
    contentEvents: result.contentEvents.map(eventToPublishableObject),
    // Note: Deliberately omitting 'tree' to ensure the object is serializable for postMessage
  };
}

/**
 * Convert NDKEvent to publishable object format
 * Ensures all properties are serializable for postMessage
 */
function eventToPublishableObject(event: any) {
  // Extract only primitive values to ensure serializability
  return {
    kind: Number(event.kind),
    content: String(event.content || ""),
    tags: Array.isArray(event.tags)
      ? event.tags.map((tag: any) =>
        Array.isArray(tag) ? tag.map((t) => String(t)) : []
      )
      : [],
    created_at: Number(event.created_at || Math.floor(Date.now() / 1000)),
    pubkey: String(event.pubkey || ""),
    id: String(event.id || ""),
    title: event.tags?.find?.((t: string[]) => t[0] === "title")?.[1] ||
      "Untitled",
  };
}

/**
 * Validate parse level parameter
 */
export function validateParseLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 2 && level <= 5;
}

/**
 * Get supported parse levels
 */
export function getSupportedParseLevels(): number[] {
  return [2, 3, 4, 5];
}
