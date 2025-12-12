/**
 * Web Worker for processing event hierarchies and storing metadata in IndexedDB.
 *
 * This worker receives a flat array of events, extracts their metadata and ordinal relationships,
 * and writes them to IndexedDB in batches. It operates on its own process to avoid blocking the
 * main JS event loop.
 */

import {
  type EventMetadata,
  type EventOrdinal,
  formatOrdinal,
  openDatabase,
  putMetadataBatch,
  putOrdinalsBatch,
} from "./idb_transaction_scripts.ts";

/**
 * Serializable event format (no NDK dependencies).
 */
export interface SerializableEvent {
  id: string;
  kind: number;
  pubkey: string;
  tags: string[][];
  created_at: number;
}

/**
 * Message types sent to the worker.
 */
export type WorkerMessage = {
  type: "INDEX_EVENTS";
  payload: {
    events: SerializableEvent[];
  };
};

/**
 * Response types sent from the worker.
 */
export type WorkerResponse =
  | { type: "PROGRESS"; payload: { processed: number; total: number } }
  | { type: "COMPLETE"; payload: { totalProcessed: number; duration: number } }
  | { type: "ERROR"; payload: { error: string } };

/**
 * Extracts the title from an event's tags.
 *
 * @param event - Serializable event
 * @returns Title string or empty string if not found
 */
function extractTitle(event: SerializableEvent): string {
  const titleTags = event.tags.filter((tag) =>
    tag[0] === "T" ||
    tag[0] === "title" ||
    tag[0] === "d"
  );

  let title: string | null = null;

  title = titleTags.find((tag) => tag[0] === "title")?.[1] ?? null;
  if (title) {
    return title;
  }

  title = titleTags.find((tag) => tag[1] === "T")?.[1] ?? null;
  if (title) {
    return title;
  }

  // We work with replaceable events primarily, so they should all at least have a d tag.
  return titleTags[0]?.[1]
    ?.split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") ?? "";
}

/**
 * Builds an address string from event kind, pubkey, and d tag.
 *
 * @param event - Serializable event
 * @returns Address string in format "kind:pubkey:d-value" or null if no d tag
 */
function buildAddress(event: SerializableEvent): string | null {
  const dTag = event.tags.find((tag) => tag[0] === "d");
  if (!dTag || !dTag[1]) return null;
  return `${event.kind}:${event.pubkey}:${dTag[1]}`;
}

/**
 * Extracts ordinal mappings from a kind 30040 event.
 *
 * @param event - Serializable event (must be kind 30040)
 * @param addressMap - Map of addresses to event IDs
 * @returns Array of ordinal mappings
 */
function extractOrdinals(
  event: SerializableEvent,
  addressMap: Map<string, string>,
): Array<EventOrdinal> {
  if (event.kind !== 30040) return [];

  const ordinals: Array<EventOrdinal> = [];
  let ordinalCounter = 0;

  // Process indexed events in tag order
  for (const tag of event.tags) {
    let childId: string | undefined;

    // Handle 'a' tags (addresses)
    if (tag[0] === "a" && tag[1]) {
      childId = addressMap.get(tag[1]);
    } // Handle 'e' tags (event IDs)
    else if (tag[0] === "e" && tag[1]) {
      childId = tag[1];
    }

    if (childId) {
      ordinals.push({
        parentId: event.id,
        ordinal: formatOrdinal(ordinalCounter),
        id: childId,
      });
      ordinalCounter++;
    }
  }

  return ordinals;
}

/**
 * Processes events and writes metadata and ordinals to IndexedDB.
 *
 * @param events - Array of serializable events to process
 */
async function processEvents(events: SerializableEvent[]): Promise<void> {
  const startTime = performance.now();

  try {
    // Build address map
    const addressMap = new Map<string, string>();
    for (const event of events) {
      const address = buildAddress(event);
      if (address) {
        addressMap.set(address, event.id);
      }
    }

    // Extract metadata and ordinals
    const metadataArray: Array<EventMetadata> = [];
    const ordinalsArray: Array<EventOrdinal> = [];

    for (const event of events) {
      // Extract metadata
      const title = extractTitle(event);
      metadataArray.push({ id: event.id, title });

      // Extract ordinals for kind 30040 events
      const ordinals = extractOrdinals(event, addressMap);
      ordinalsArray.push(...ordinals);
    }

    // Open database and write in batches
    const db = await openDatabase();

    try {
      await putMetadataBatch(db, metadataArray);
      await putOrdinalsBatch(db, ordinalsArray);

      const duration = performance.now() - startTime;

      // Send completion message
      self.postMessage(
        {
          type: "COMPLETE",
          payload: {
            totalProcessed: events.length,
            duration,
          },
        } satisfies WorkerResponse,
      );
    } finally {
      db.close();
    }
  } catch (error) {
    // Send error message
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage(
      {
        type: "ERROR",
        payload: { error: errorMessage },
      } satisfies WorkerResponse,
    );
  }
}

/**
 * Worker message handler.
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === "INDEX_EVENTS") {
    await processEvents(message.payload.events);
  }
};
