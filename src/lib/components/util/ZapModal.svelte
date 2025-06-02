<script lang="ts">
  import { Modal, Button, P } from "flowbite-svelte";
  import QrCode from "$components/util/QrCode.svelte";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import { signEvent, getEventHash } from '$lib/utils';
  import { getNostrClient } from "$lib/nostr/client";
  import { fallbackRelays } from "$lib/consts";
  import { getTagValue } from "$lib/utils/eventUtils";
  import type { NostrEvent } from "$lib/types/nostr";
  // @ts-ignore
  import { bech32 } from "https://esm.sh/bech32";

  interface LNURLPayResponse {
    allowsNostr: boolean;
    nostrPubkey?: string;
    callback: string;
    minSendable: number;
    maxSendable: number;
    metadata: string;
  }

  interface ZapTag {
    pubkey: string;
    relay: string;
    weight?: string;
  }

  const {
    lud16,
    lud06,
    lnurl,
    recipientPubkey,
    eventId,
    eventCoordinate,
    zapTags,
    onClose = () => {},
    open = false,
  } = $props<{
    lud16?: string;
    lud06?: string;
    lnurl?: string | null;
    recipientPubkey: string;
    eventId?: string;
    eventCoordinate?: string;
    zapTags?: ZapTag[];
    onClose?: () => void;
    open?: boolean;
  }>();

  let isOpen = $state(open);

  $effect(() => {
    isOpen = open;
  });

  $effect(() => {
    if (!isOpen) {
      handleClose();
    }
  });

  let zapAmount = $state(1000); // Default to 1000 sats
  let zapComment = $state("");
  let zapInvoice = $state<string | null>(null);
  let zapError = $state<string | null>(null);
  let lnurlPayInfo = $state<LNURLPayResponse | null>(null);
  let zapReceiptSub: { stop: () => void } | undefined;
  let zapReceived = $state(false);
  let zapReceivedTimeout: ReturnType<typeof setTimeout> | null = null;

  // Helper function to decode LNURL from lud06
  function decodeLnurl(lud06: string): string | null {
    try {
      const { words } = bech32.decode(lud06);
      const urlBytes = bech32.fromWords(words);
      return new TextDecoder().decode(new Uint8Array(urlBytes));
    } catch {
      return null;
    }
  }

  // Helper function to encode LNURL from URL
  function encodeLnurl(url: string): string | null {
    try {
      const urlBytes = new TextEncoder().encode(url);
      const words = bech32.toWords(urlBytes);
      return bech32.encode('lnurl', words, 1023);
    } catch {
      return null;
    }
  }

  // Helper function to validate a BIP-340 public key
  function isValidBIP340Pubkey(pubkey: string): boolean {
    return /^[0-9a-f]{64}$/i.test(pubkey);
  }

  // Helper function to get LNURL pay endpoint URL
  async function getLnurlPayEndpoint(): Promise<string | null> {
    // First check zap tags if available
    if (zapTags && zapTags.length > 0) {
      // Calculate total weight
      const totalWeight = zapTags.reduce((sum: number, tag: ZapTag) => 
        sum + (parseInt(tag.weight || "1") || 1), 0);
      
      // Find the recipient's tag
      const recipientTag = zapTags.find((tag: ZapTag) => tag.pubkey === recipientPubkey);
      if (recipientTag) {
        // Fetch the recipient's profile from the specified relay
        try {
          const client = getNostrClient([recipientTag.relay]);
          if (!client) return null;

          const events = await client.fetchEvents({
            kinds: [0],
            authors: [recipientTag.pubkey],
          });

          const profile = events[0];
          if (profile) {
            const metadata = JSON.parse(profile.content);
            if (metadata.lud16) {
              const [name, domain] = metadata.lud16.split('@');
              if (name && domain) {
                return `https://${domain}/.well-known/lnurlp/${name}`;
              }
            }
            if (metadata.lud06) {
              return decodeLnurl(metadata.lud06);
            }
          }
        } catch (err) {
          console.error('Error fetching profile from zap tag:', err);
        }
      }
    }

    // Fall back to provided lud16
    if (lud16) {
      const [name, domain] = lud16.split('@');
      if (name && domain) {
        return `https://${domain}/.well-known/lnurlp/${name}`;
      }
    }

    // Fall back to provided lud06
    if (lud06) {
      return decodeLnurl(lud06);
    }

    // Fall back to provided lnurl
    if (lnurl) {
      return decodeLnurl(lnurl);
    }

    return null;
  }

  // Fetch and validate LNURL pay endpoint info
  async function fetchLnurlPayInfo(): Promise<LNURLPayResponse | null> {
    const endpoint = await getLnurlPayEndpoint();
    if (!endpoint) {
      zapError = "No valid Lightning address found";
      return null;
    }

    try {
      const response = await fetch(endpoint);
      const data = await response.json();

      // Validate required fields
      if (!data.callback || typeof data.callback !== 'string') {
        zapError = "Invalid LNURL pay endpoint: missing callback";
        return null;
      }

      if (typeof data.minSendable !== 'number' || typeof data.maxSendable !== 'number') {
        zapError = "Invalid LNURL pay endpoint: missing sendable amounts";
        return null;
      }

      // Validate Nostr support
      if (data.allowsNostr) {
        if (!data.nostrPubkey || !isValidBIP340Pubkey(data.nostrPubkey)) {
          zapError = "Invalid LNURL pay endpoint: invalid Nostr pubkey";
          return null;
        }
      }

      return data;
    } catch (err) {
      console.error('Error fetching LNURL pay info:', err);
      zapError = "Failed to fetch Lightning address info";
      return null;
    }
  }

  // Fetch LNURL pay info when modal opens
  $effect(() => {
    if (isOpen) {
      fetchLnurlPayInfo().then(info => {
        lnurlPayInfo = info;
        if (info) {
          // Set initial amount within allowed range
          zapAmount = Math.max(info.minSendable / 1000, Math.min(info.maxSendable / 1000, 1000));
        }
      });
    }
  });

  async function createZapRequest(
    event: NostrEvent,
    recipientPubkey: string,
    amount: number,
    comment: string
  ): Promise<NostrEvent | null> {
    try {
      const amountMsats = amount * 1000;
      const tags: string[][] = [
        ["relays", ...fallbackRelays],
        ["amount", amountMsats.toString()],
        ["p", recipientPubkey],
      ];

      if (event.id) {
        tags.push(["e", event.id]);
      }

      if (eventCoordinate) {
        tags.push(["a", eventCoordinate]);
      }

      if (zapTags) {
        zapTags.forEach((tag: ZapTag) => {
          if (tag.weight) {
            tags.push(["zap", tag.pubkey, tag.relay, tag.weight]);
          } else {
            tags.push(["zap", tag.pubkey, tag.relay]);
          }
        });
      }

      const zapRequest: Omit<NostrEvent, 'id' | 'sig'> = {
        kind: 9734,
        content: comment,
        pubkey: recipientPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      };

      const id = getEventHash(zapRequest);
      const sig = await signEvent(zapRequest, id);

      return {
        ...zapRequest,
        id,
        sig: sig.toString()
      };
    } catch (error) {
      console.error('Error creating zap request:', error);
      return null;
    }
  }

  async function requestZapInvoice() {
    if (!lnurl || !recipientPubkey || !eventId) return;

    try {
      const client = getNostrClient();
      if (!client) return;

      const zapRequest = await createZapRequest(
        { 
          id: eventId, 
          kind: 1, 
          pubkey: recipientPubkey, 
          created_at: Math.floor(Date.now() / 1000), 
          content: '', 
          tags: [], 
          sig: '' 
        },
        recipientPubkey,
        zapAmount,
        zapComment
      );
      if (!zapRequest) return;

      await client.publish(zapRequest);

      const bolt11 = getTagValue(zapRequest, 'bolt11');
      if (!bolt11) return;

      zapInvoice = bolt11;
      await subscribeForZapReceipt(zapRequest);
    } catch (error) {
      console.error('Error requesting zap invoice:', error);
      zapError = 'Failed to request zap invoice';
    }
  }

  async function subscribeForZapReceipt(zapRequest: NostrEvent) {
    if (!zapReceiptSub) {
      const client = getNostrClient();
      if (!client) return;

      const subscription = client.subscribe(
        {
          kinds: [9735],
          '#e': [zapRequest.id],
          since: Math.floor(Date.now() / 1000)
        },
        { closeOnEose: false }
      );

      subscription.on('event', (event: NostrEvent) => {
        const bolt11 = getTagValue(event, 'bolt11');
        const preimage = getTagValue(event, 'preimage');
        const description = getTagValue(event, 'description');

        if (bolt11 && preimage && description) {
          try {
            const zapRequest = JSON.parse(description) as NostrEvent;
            const zapRequestBolt11 = getTagValue(zapRequest, 'bolt11');

            if (zapRequestBolt11 === bolt11) {
              console.log('Zap receipt received:', event);
              // Handle successful zap
              subscription.stop();
              zapReceiptSub = undefined;
              isOpen = false;
              zapReceived = true;
              if (zapReceivedTimeout) clearTimeout(zapReceivedTimeout);
              zapReceivedTimeout = setTimeout(() => {
                isOpen = false;
                zapReceived = false;
              }, 2000);
            }
          } catch (error) {
            console.error('Error parsing zap request:', error);
          }
        }
      });

      zapReceiptSub = subscription;
    }
  }

  function handleClose() {
    zapInvoice = null;
    zapError = null;
    zapComment = "";
    zapAmount = 1000;
    lnurlPayInfo = null;
    zapReceived = false;
    if (zapReceivedTimeout) clearTimeout(zapReceivedTimeout);
    onClose();
    if (zapReceiptSub) {
      zapReceiptSub.stop();
      zapReceiptSub = undefined;
    }
  }
</script>

<Modal
  class="modal-leather"
  title="Send Zap"
  bind:open={isOpen}
  onclose={handleClose}
  outsideclose
  size="sm"
>
  <div class="space-y-4">
    <div class="flex flex-col gap-2">
      <label for="zapAmount" class="text-sm font-medium">Amount (sats)</label>
      <input
        type="number"
        id="zapAmount"
        bind:value={zapAmount}
        min={lnurlPayInfo ? lnurlPayInfo.minSendable / 1000 : 1}
        max={lnurlPayInfo ? lnurlPayInfo.maxSendable / 1000 : undefined}
        class="input-leather"
      />
      {#if lnurlPayInfo}
        <span class="text-xs text-gray-500">
          Min: {lnurlPayInfo.minSendable / 1000} sats, Max: {lnurlPayInfo.maxSendable / 1000} sats
        </span>
      {/if}
    </div>
    
    <div class="flex flex-col gap-2">
      <label for="zapComment" class="text-sm font-medium">Comment (optional)</label>
      <textarea
        id="zapComment"
        bind:value={zapComment}
        class="input-leather"
        rows="2"
        placeholder="Add a message with your zap..."
      ></textarea>
    </div>

    {#if zapError}
      <P class="text-red-500 text-sm">{zapError}</P>
    {/if}

    {#if zapInvoice}
      <div class="flex flex-col items-center gap-4">
        <QrCode value={zapInvoice} />
        <div class="w-full break-all text-center text-xs mt-2">
          <CopyToClipboard icon={false} displayText={zapInvoice} />
        </div>
        <P class="text-xs text-gray-600 dark:text-gray-400">
          Scan this QR code with your Lightning wallet to complete the zap
        </P>
        {#if zapReceived}
          <div class="text-green-600 text-sm font-semibold mt-2">Zap received!</div>
        {/if}
      </div>
    {:else}
      <Button
        class="btn-leather w-full"
        color="primary"
        onclick={requestZapInvoice}
        disabled={!lnurlPayInfo}>
        Request Invoice
      </Button>
    {/if}
  </div>
</Modal> 