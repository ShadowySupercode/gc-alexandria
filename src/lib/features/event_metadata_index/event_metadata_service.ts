/**
 * Service for orchestrating event metadata indexing using Web Workers.
 *
 * This service manages the lifecycle of the IndexedDB connection and worker,
 * coordinates the extraction of event hierarchies from PublicationTree instances,
 * and provides a query interface for retrieving metadata and ordinal relationships.
 */

import type { NDKEvent } from "@nostr-dev-kit/ndk";
import type { PublicationTree } from "$lib/data_structures/publication_tree.ts";
import { TreeTraversalMode } from "$lib/data_structures/publication_tree.ts";
import {
  type EventMetadata,
  getMetadata,
  getOrderedChildren,
  getParentInfo,
  openDatabase,
} from "./idb_transaction_scripts.ts";
import type {
  SerializableEvent,
  WorkerResponse,
} from "./event_metadata_worker.ts";

/**
 * Service for indexing and querying event metadata.
 *
 * This service follows the singleton pattern and implements the Disposable
 * interface for proper resource cleanup.
 */
class EventMetadataService implements Disposable {
  #db: IDBDatabase | null = null;
  #worker: Worker | null = null;
  #activeIndexing: Set<string> = new Set();

  /**
   * Indexes a complete hierarchy of events from a PublicationTree.
   *
   * @param tree - PublicationTree instance to index
   * @returns Promise that resolves when indexing is complete
   */
  async indexHierarchy(tree: PublicationTree): Promise<void> {
    // Get root event to use as identifier
    const rootIterator = tree[Symbol.asyncIterator]();
    const rootResult = await rootIterator.next(TreeTraversalMode.All);

    if (rootResult.done || !rootResult.value) {
      console.warn("[EventMetadataService] Cannot index empty tree");
      return;
    }

    const rootEvent = rootResult.value;
    const rootId = rootEvent.id;

    // Check if already indexing this hierarchy
    if (this.#activeIndexing.has(rootId)) {
      console.debug(
        `[EventMetadataService] Already indexing hierarchy ${rootId}`,
      );
      return;
    }

    this.#activeIndexing.add(rootId);
    const subRoots = [];

    try {
      // Collect all events from the tree
      const events: NDKEvent[] = [rootEvent];

      for await (const event of tree) {
        // Guard clause - avoid re-indexing sub-hierarchies already being indexed
        if (this.#activeIndexing.has(event.id)) {
          continue;
        }

        // Set memo when sub-hierarchy is being indexed
        if (event.kind === 30040) {
          this.#activeIndexing.add(event.id);
          subRoots.push(event.id);
        }

        if (event && event.id !== rootId) {
          events.push(event);
        }
      }

      // Convert NDKEvent objects to SerializableEvent format
      const serializableEvents: SerializableEvent[] = events.map((event) => ({
        id: event.id,
        kind: event.kind ?? 0,
        pubkey: event.pubkey,
        tags: event.tags,
        created_at: event.created_at ?? 0,
      }));

      console.log(
        `[EventMetadataService] Collected ${serializableEvents.length} events for indexing`,
      );

      // Initialize worker if needed
      if (!this.#worker) {
        this.#initializeWorker();
      }

      // Send events to the worker
      // Do not await worker - process in background
      this.#processInWorker(serializableEvents);
    } catch (error) {
      console.error("[EventMetadataService] Error indexing hierarchy:", error);
      throw error;
    } finally {
      this.#activeIndexing.delete(rootId);
      for (const id of subRoots) {
        this.#activeIndexing.delete(id);
      }
    }
  }

  /**
   * Retrieves metadata for a specific event.
   *
   * @param eventId - Event ID to look up
   * @returns Promise resolving to metadata or null if not found
   */
  async getMetadata(eventId: string): Promise<EventMetadata | null> {
    const db = await this.#ensureDatabase();
    return getMetadata(db, eventId);
  }

  /**
   * Retrieves ordered child event IDs for a parent event.
   *
   * @param parentId - Parent event ID
   * @returns Promise resolving to array of child event IDs in order
   */
  async getOrderedChildren(parentId: string): Promise<string[]> {
    const db = await this.#ensureDatabase();
    return getOrderedChildren(db, parentId);
  }

  /**
   * Retrieves parent information for a child event (reverse lookup).
   *
   * @param childId - Child event ID
   * @returns Promise resolving to array of parent-ordinal pairs
   */
  async getParentInfo(
    childId: string,
  ): Promise<Array<{ parentId: string; ordinal: number }>> {
    const db = await this.#ensureDatabase();
    const results = await getParentInfo(db, childId);

    // Convert ordinal strings to numbers
    return results.map((result) => ({
      parentId: result.parentId,
      ordinal: parseInt(result.ordinal, 10),
    }));
  }

  /**
   * Checks if a hierarchy is currently being indexed.
   *
   * @param rootEventId - Root event ID of the hierarchy
   * @returns True if indexing is in progress
   */
  isIndexing(rootEventId: string): boolean {
    return this.#activeIndexing.has(rootEventId);
  }

  /**
   * Cleans up resources (database connection and worker).
   */
  [Symbol.dispose](): void {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
    }

    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
    }

    this.#activeIndexing.clear();
  }

  /**
   * Ensures the database is open and ready.
   *
   * @returns Promise resolving to the database instance
   */
  async #ensureDatabase(): Promise<IDBDatabase> {
    if (!this.#db) {
      this.#db = await openDatabase();
    }
    return this.#db;
  }

  /**
   * Initializes the Web Worker.
   */
  #initializeWorker(): void {
    this.#worker = new Worker(
      new URL("./event_metadata_worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    this.#worker.onerror = (error) => {
      console.error("[EventMetadataService] Worker error:", error);
    };
  }

  /**
   * Processes events in the worker and waits for completion.
   *
   * @param events - Array of serializable events to process
   * @returns Promise that resolves when processing is complete
   */
  #processInWorker(events: SerializableEvent[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.#worker) {
        reject(new Error("Worker not initialized"));
        return;
      }

      // Set up message handler
      const handleMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;

        switch (response.type) {
          case "PROGRESS":
            console.debug(
              `[EventMetadataService] Progress: ${response.payload.processed}/${response.payload.total}`,
            );
            break;

          case "COMPLETE":
            console.log(
              `[EventMetadataService] Indexing complete: ${response.payload.totalProcessed} events in ${response.payload.duration}ms`,
            );
            this.#worker?.removeEventListener("message", handleMessage);
            // AI-TODO: Add event emitter from service to indicate when processing is complete
            resolve();
            break;

          case "ERROR":
            console.error(
              "[EventMetadataService] Worker error:",
              response.payload.error,
            );
            this.#worker?.removeEventListener("message", handleMessage);
            reject(new Error(response.payload.error));
            break;
        }
      };

      this.#worker.addEventListener("message", handleMessage);

      // Send events to worker
      this.#worker.postMessage({
        type: "INDEX_EVENTS",
        payload: { events },
      });
    });
  }
}

/**
 * Singleton instance of the event metadata service.
 *
 * This follows the pattern used by other cache services in the codebase
 * (npubCache, searchCache, etc.).
 */
export const eventMetadataService = new EventMetadataService();
