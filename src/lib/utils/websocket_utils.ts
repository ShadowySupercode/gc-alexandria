import { WebSocketPool } from "../data_structures/websocket_pool.ts";
import { error } from "@sveltejs/kit";
import { naddrDecode, neventDecode } from "../utils.ts";
import { activeInboxRelays, activeOutboxRelays } from "../ndk.ts";
import { get } from "svelte/store";

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  [tag: `#${string}`]: string[] | undefined; 
  since?: number;
  until?: number;
  limit?: number;
}

type ResolveCallback<T> = (value: T | PromiseLike<T>) => void;
type RejectCallback = (reason?: any) => void;
type EventHandler = (ev: Event) => void;
type MessageEventHandler = (ev: MessageEvent) => void;
type EventHandlerReject = (reject: RejectCallback) => EventHandler; 
type EventHandlerResolve<T> = (resolve: ResolveCallback<T>) => (reject: RejectCallback) => MessageEventHandler;

function handleMessage(
  ev: MessageEvent,
  subId: string,
  resolve: (event: NostrEvent) => void,
  reject: (reason: any) => void
) {
  const data = JSON.parse(ev.data);

  if (data[1] !== subId) {
    return;
  }

  switch (data[0]) {
    case "EVENT":
      break;
    case "CLOSED":
      reject(new Error(`[WebSocket Utils]: Subscription ${subId} closed`));
      break;
    case "EOSE":
      reject(new Error(`[WebSocket Utils]: Event not found`));
      break;
  }

  const event = data[2] as NostrEvent;
  if (!event) {
    return;
  }

  resolve(event);
}

function handleError(
  ev: Event,
  reject: (reason: any) => void
) {
  reject(ev);
}

export async function fetchNostrEvent(filter: NostrFilter): Promise<NostrEvent | null> {
  // AI-NOTE: Updated to use active relay stores instead of hardcoded relay URL
  // This ensures the function uses the user's configured relays and can find events
  // across multiple relays rather than being limited to a single hardcoded relay.
  
  // Get available relays from the active relay stores
  const inboxRelays = get(activeInboxRelays);
  const outboxRelays = get(activeOutboxRelays);
  
  // Combine all available relays, prioritizing inbox relays
  let availableRelays = [...inboxRelays, ...outboxRelays];
  
  // AI-NOTE: Use fallback relays when stores are empty (e.g., during SSR)
  // This ensures publications can still load even when relay stores haven't been populated
  if (availableRelays.length === 0) {
    // Import fallback relays from constants
    const { searchRelays, secondaryRelays } = await import("../consts.ts");
    availableRelays = [...searchRelays, ...secondaryRelays];
    
    if (availableRelays.length === 0) {
      availableRelays = ["wss://thecitadel.nostr1.com"];
    }
  }
  
  // Try all available relays in parallel and return the first result
  const relayPromises = availableRelays.map(async (relay) => {
    try {
      const ws = await WebSocketPool.instance.acquire(relay);
      const subId = crypto.randomUUID();

      // AI-NOTE: Currying is used here to abstract the internal handler logic away from the WebSocket
      // handling logic. The message and error handlers themselves can be refactored without affecting
      // the WebSocket handling logic.
      const curriedMessageHandler: (subId: string) => (resolve: ResolveCallback<NostrEvent>) => (reject: RejectCallback) => MessageEventHandler =
        (subId) =>
          (resolve) =>
            (reject) =>
              (ev: MessageEvent) =>
                handleMessage(ev, subId, resolve, reject);
      const curriedErrorHandler: EventHandlerReject =
        (reject) =>
          (ev: Event) =>
            handleError(ev, reject);

      // AI-NOTE: These variables store references to partially-applied handlers so that the `finally`
      // block receives the correct references to clean up the listeners.
      let messageHandler: MessageEventHandler;
      let errorHandler: EventHandler;

      const res = new Promise<NostrEvent>((resolve, reject) => {
        messageHandler = curriedMessageHandler(subId)(resolve)(reject);
        errorHandler = curriedErrorHandler(reject);

        ws.addEventListener("message", messageHandler);
        ws.addEventListener("error", errorHandler);
      })
      .withTimeout(2000)
      .finally(() => {
        ws.removeEventListener("message", messageHandler);
        ws.removeEventListener("error", errorHandler);
        WebSocketPool.instance.release(ws);
      });

      ws.send(JSON.stringify(["REQ", subId, filter]));
      
      const result = await res;
      if (result) {
        return result;
      }
      
      return null;
    } catch (err) {
      return null;
    }
  });

  // Wait for all relay results and find the first successful one
  const results = await Promise.allSettled(relayPromises);
  
  // Find the first successful result
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }
  
  return null;
}

/**
 * Fetches an event by hex ID, throwing a SvelteKit 404 error if not found.
 */
export async function fetchEventById(id: string): Promise<NostrEvent> {
  try {
    const event = await fetchNostrEvent({ ids: [id], limit: 1 });
    if (!event) {
      error(404, `Event not found for ID: ${id}. href="/events?id=${id}"`);
    }
    return event;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(404, `Failed to fetch event by ID: ${err}`);
  }
}

/**
 * Fetches an event by d tag, throwing a 404 if not found.
 */
export async function fetchEventByDTag(dTag: string): Promise<NostrEvent> {
  try {
    const event = await fetchNostrEvent({ "#d": [dTag], limit: 1 });
    if (!event) {
      error(404, `Event not found for d-tag: ${dTag}. href="/events?d=${dTag}"`);
    }
    return event;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(404, `Failed to fetch event by d-tag: ${err}`);
  }
}

/**
 * Fetches an event by naddr identifier.
 */
export async function fetchEventByNaddr(naddr: string): Promise<NostrEvent> {
  try {
    const decoded = naddrDecode(naddr);
    const filter = {
      kinds: [decoded.kind],
      authors: [decoded.pubkey],
      "#d": [decoded.identifier],
    };
    const event = await fetchNostrEvent(filter);
    if (!event) {
      error(404, `Event not found for naddr: ${naddr}. href="/events?id=${naddr}"`);
    }
    return event;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(404, `Failed to fetch event by naddr: ${err}`);
  }
}

/**
 * Fetches an event by nevent identifier.
 */
export async function fetchEventByNevent(nevent: string): Promise<NostrEvent> {
  try {
    const decoded = neventDecode(nevent);
    const event = await fetchNostrEvent({ ids: [decoded.id], limit: 1 });
    if (!event) {
      error(404, `Event not found for nevent: ${nevent}. href="/events?id=${nevent}"`);
    }
    return event;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(404, `Failed to fetch event by nevent: ${err}`);
  }
}
