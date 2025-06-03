import { NostrClient } from './client';

let client: NostrClient | null = null;

export function getNostrClient(relays: string[] = []): NostrClient {
  if (!client) {
    client = new NostrClient(relays);
  }
  return client;
} 