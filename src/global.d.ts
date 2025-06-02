/**
 * Global type declarations for the application
 */

// Nostr WebExtension interface
interface NostrExtension {
  /**
   * Get the public key of the currently active account
   */
  getPublicKey(): Promise<string>;

  /**
   * Sign a Nostr event
   * @param event The event to sign
   */
  signEvent(event: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    pubkey: string;
  }): Promise<{
    id: string;
    sig: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
  }>;

  /**
   * Get the relays associated with the currently active account
   */
  getRelays(): Promise<{
    [url: string]: { read: boolean; write: boolean };
  }>;
}

// Extend the Window interface
interface Window {
  nostr?: NostrExtension;
} 