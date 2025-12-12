/**
 * IndexedDB transaction scripts for event metadata storage.
 */

const DB_NAME = "Alexandria_Event_Metadata";
const DB_VERSION = 1; // AI-NOTE: Increment if schema changes
const METADATA_STORE = "event-metadata";
const ORDINALS_STORE = "event-ordinals";

/**
 * Event metadata structure stored in IndexedDB.
 */
export interface EventMetadata {
  id: string;
  title: string;
}

/**
 * Ordinal mapping structure for parent-child relationships.
 */
export interface EventOrdinal {
  parentId: string;
  ordinal: string;
  id: string;
}

/**
 * Opens or creates the event metadata IndexedDB database.
 *
 * @returns Promise resolving to the database instance
 */
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(
        new Error(
          `[event_metadata_index] Failed to open database: ${request.error?.message}`,
        ),
      );
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    // Apply schema to IndexedDB if needed
    // AI-NOTE: If the schema ever changes, handle schema migration here.
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create event-metadata store
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        const metadataStore = db.createObjectStore(METADATA_STORE, {
          keyPath: "id",
        });
        metadataStore.createIndex("title", "title", { unique: false });
      }

      // Create event-ordinals store
      if (!db.objectStoreNames.contains(ORDINALS_STORE)) {
        const ordinalsStore = db.createObjectStore(ORDINALS_STORE, {
          keyPath: ["parentId", "ordinal"],
        });
        ordinalsStore.createIndex("id", "id", { unique: false });
      }
    };
  });
}

/**
 * Retrieves event metadata by event ID.
 *
 * @param db - IndexedDB database instance
 * @param eventId - Nostr event ID
 * @returns Promise resolving to metadata or null if not found
 */
export function getMetadata(
  db: IDBDatabase,
  eventId: string,
): Promise<EventMetadata | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], "readonly");
    const store = transaction.objectStore(METADATA_STORE);
    const request = store.get(eventId);

    request.onerror = () => {
      reject(
        new Error(
          `[event_metadata_index] Failed to get metadata: ${request.error?.message}`,
        ),
      );
    };

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };
  });
}

/**
 * Stores a batch of event metadata records in a single transaction.
 *
 * @param db - IndexedDB database instance
 * @param metadataArray - Array of metadata records to store
 */
export function putMetadataBatch(
  db: IDBDatabase,
  metadataArray: Array<EventMetadata>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([METADATA_STORE], "readwrite");
    const store = transaction.objectStore(METADATA_STORE);

    for (const metadata of metadataArray) {
      store.put(metadata);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        new Error(
          `[event_metadata_index] Batch transaction failed: ${transaction.error?.message}`,
        ),
      );
    };
  });
}

/**
 * Stores a batch of ordinal mappings in a single transaction.
 *
 * @param db - IndexedDB database instance
 * @param ordinals - Array of ordinal mappings to store
 */
export function putOrdinalsBatch(
  db: IDBDatabase,
  ordinals: Array<EventOrdinal>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ORDINALS_STORE], "readwrite");
    const store = transaction.objectStore(ORDINALS_STORE);

    for (const ordinal of ordinals) {
      store.put(ordinal);
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(
        new Error(
          `[event_metadata_index] Batch transaction failed: ${transaction.error?.message}`,
        ),
      );
    };
  });
}

/**
 * Retrieves all child event IDs for a parent in ordinal order.
 *
 * @param db - Database instance
 * @param parentId - Nostr event ID of a kind 30040 index event
 * @returns Promise resolving to array of child event IDs in order
 */
export function getOrderedChildren(
  db: IDBDatabase,
  parentId: string,
): Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ORDINALS_STORE], "readonly");
    const store = transaction.objectStore(ORDINALS_STORE);

    const range = IDBKeyRange.bound(
      [parentId, "0000000"],
      [parentId, "9999999"],
    );

    const request = store.openCursor(range);
    const children: Array<string> = [];

    request.onerror = () => {
      reject(
        new Error(
          `[event_metadata_index] Failed to get ordered children: ${request.error?.message}`,
        ),
      );
    };

    // AI-NOTE: If the `children` array ever becomes prohibitively large in production cases,
    // return an `AsyncIterable<string>` instead to stream events from the cursor.
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const ordinal = cursor.value as EventOrdinal;
        children.push(ordinal.id);
        cursor.continue();
      } else {
        resolve(children);
      }
    };
  });
}

/**
 * Retrieves information on kind 30040 index events that index the given child event.
 *
 * @param db - IndexedDB database instance
 * @param childId - Nostr event ID of a child event
 * @returns Promise resolving to array of parent-ordinal pairs
 */
export function getParentInfo(
  db: IDBDatabase,
  childId: string,
): Promise<Array<{ parentId: string; ordinal: string }>> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ORDINALS_STORE], "readonly");
    const store = transaction.objectStore(ORDINALS_STORE);
    const index = store.index("id");
    const request = index.openCursor(IDBKeyRange.only(childId));
    const parents: Array<{ parentId: string; ordinal: string }> = [];

    request.onerror = () => {
      reject(
        new Error(
          `[event_metadata_index] Failed to get parent info: ${request.error?.message}`,
        ),
      );
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const ordinal = cursor.value as EventOrdinal;
        parents.push({ parentId: ordinal.parentId, ordinal: ordinal.ordinal });
        cursor.continue();
      } else {
        resolve(parents);
      }
    };
  });
}

/**
 * Formats an ordinal number as a left-padded 7-digit string.
 *
 * @param ordinal - Ordinal number (0-9999999)
 * @returns Left-padded string representation
 */
export function formatOrdinal(ordinal: number): string {
  if (ordinal < 0 || ordinal > 9999999) {
    throw new RangeError(
      `Ordinal must be between 0 and 9999999, got ${ordinal}`,
    );
  }
  return ordinal.toString().padStart(7, "0");
}
