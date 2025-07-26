interface Window {
  hljs?: {
    highlightAll: () => void;
  };
  MathJax?: {
    typesetPromise: () => Promise<void>;
  };
}

// Nostr browser extension interface
interface Nostr {
  getRelays?: () => Promise<Record<string, any>>;
  signEvent?: (event: any) => Promise<{ sig: string }>;
}

declare global {
  var nostr: Nostr | undefined;
}
