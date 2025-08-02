import { WebSocketPool } from "../data_structures/websocket_pool.ts";
import { error } from "@sveltejs/kit";
import { naddrDecode, neventDecode } from "../utils.ts";

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

export async function fetchNostrEvent(filter: NostrFilter): Promise<NostrEvent> {
  // TODO: Improve relay selection when relay management is implemented.
  const ws = await WebSocketPool.instance.acquire("wss://thecitadel.nostr1.com");
  const subId = crypto.randomUUID();

  const res = new Promise<NostrEvent>((resolve, reject) => {
    ws.addEventListener("message", (ev) => {
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
    });

    ws.addEventListener("error", (ev) => {
      reject(ev);
    });
  }).withTimeout(2000);

  ws.send(JSON.stringify(["REQ", subId, filter]));
  return res;
}

/**
 * Fetches an event by hex ID, throwing a SvelteKit 404 error if not found.
 */
export async function fetchEventById(id: string): Promise<NostrEvent> {
  try {
    const event = await fetchNostrEvent({ ids: [id], limit: 1 });
    if (!event) {
      error(404, `Event not found for ID: ${id}`);
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
      error(404, `Event not found for d-tag: ${dTag}`);
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
      error(404, `Event not found for naddr: ${naddr}`);
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
      error(404, `Event not found for nevent: ${nevent}`);
    }
    return event;
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    error(404, `Failed to fetch event by nevent: ${err}`);
  }
}
