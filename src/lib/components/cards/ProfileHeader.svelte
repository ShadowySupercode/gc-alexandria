<script lang="ts">
  import { Card, Img, Modal, Button, P } from "flowbite-svelte";
  import { onMount } from "svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { type NostrProfile, toNpub, signEvent, publishEvent } from "$lib/utils/nostrUtils";
  import QrCode from "$components/util/QrCode.svelte";
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  // @ts-ignore
  import { bech32 } from "https://esm.sh/bech32";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import DualPill from "$components/util/DualPill.svelte";
  import { formatTimestampToDate } from "$lib/utils/dateUtils";
  import ZapOutline from "$components/util/ZapOutline.svelte";
  import { ndkInstance } from "$lib/ndk";
  import { get } from 'svelte/store';
  import { fallbackRelays } from "$lib/consts";
  import ZapModal from "$components/util/ZapModal.svelte";

  const { event, profile, typeDisplay } = $props<{
    event: NDKEvent;
    profile: NostrProfile;
    typeDisplay: any;
  }>();

  let lnModalOpen = $state(false);
  let zapModalOpen = $state(false);
  let lnurl = $state<string | null>(null);
  let zapAmount = $state(1000); // Default to 1000 sats
  let zapComment = $state("");
  let zapInvoice = $state<string | null>(null);
  let zapError = $state<string | null>(null);

  function encodeLnurl(url: string): string | null {
    try {
      const urlBytes = new TextEncoder().encode(url);
      // Some bech32 libs may have stricter limits, so catch errors
      const words = bech32.toWords(urlBytes);
      return bech32.encode('lnurl', words, 1023);
    } catch {
      return null;
    }
  }

  onMount(() => {
    if (profile?.lud16) {
      try {
        const [name, domain] = profile.lud16.split('@');
        if (!name || !domain) throw new Error('Malformed LN address');
        const url = `https://${domain}/.well-known/lnurlp/${name}`;
        const encoded = encodeLnurl(url);
        // Only set lnurl if encoding succeeded and is a reasonable length
        lnurl = (encoded && encoded.length < 200) ? encoded : null;
      } catch (err) {
        console.log('Error converting LN address to LNURL', err);
        lnurl = null;
      }
    }
  });

  // Fix 1: Use display_name consistently
  // Fix 2: Move image error handlers to functions
  function handleBannerError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
  }
  function handleAvatarError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.src = '/favicon.png';
  }
  // Fix 3: Move Button click handler to a function
  function openLnModal() {
    lnModalOpen = true;
  }

  $effect(() => {
    if (lnurl) {
      try {
        const { words } = bech32.decode(lnurl);
        const urlBytes = bech32.fromWords(words);
        const decodedUrl = new TextDecoder().decode(new Uint8Array(urlBytes));
      } catch (err) {
        lnurl = null; // Fallback: hide LNURL/QR, show only Lightning address
      }
    }
  });

  async function requestZapInvoice() {
    if (!profile?.lud16 || !lnurl) {
      zapError = "No Lightning address available";
      return;
    }

    try {
      const [name, domain] = profile.lud16.split('@');
      if (!name || !domain) throw new Error('Malformed LN address');
      const url = `https://${domain}/.well-known/lnurlp/${name}`;
      
      // First get the LNURL pay endpoint info
      const response = await fetch(url);
      const lnurlData = await response.json();
      
      if (!lnurlData.allowsNostr || !lnurlData.nostrPubkey) {
        zapError = "This Lightning address doesn't support Nostr zaps";
        return;
      }

      // Create zap request event
      const ndk = get(ndkInstance);
      if (!ndk?.signer) {
        zapError = "No signer available";
        return;
      }

      const pubkey = ndk.signer.pubkey;
      if (!pubkey) {
        zapError = "No pubkey available";
        return;
      }

      const zapRequest = {
        kind: 9734,
        content: zapComment,
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["relays", ...fallbackRelays],
          ["amount", zapAmount.toString()],
          ["lnurl", lnurl],
          ["p", event.pubkey],
        ],
      };

      const sig = await signEvent(zapRequest);
      const zapRequestWithSig = { ...zapRequest, sig };
      
      // Send zap request to callback URL
      const callbackUrl = new URL(lnurlData.callback);
      callbackUrl.searchParams.set('amount', zapAmount.toString());
      callbackUrl.searchParams.set('nostr', encodeURIComponent(JSON.stringify(zapRequestWithSig)));
      callbackUrl.searchParams.set('lnurl', lnurl);

      const zapResponse = await fetch(callbackUrl.toString());
      const { pr: invoice } = await zapResponse.json();
      
      if (!invoice) {
        zapError = "Failed to get invoice";
        return;
      }

      zapInvoice = invoice;
      zapError = null;
    } catch (err) {
      console.error('Error requesting zap invoice:', err);
      zapError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  function openZapModal() {
    zapModalOpen = true;
    zapInvoice = null;
    zapError = null;
  }
</script>

{#if profile}
  <Card class="ArticleBox card-leather w-full max-w-2xl">
    <div class="space-y-4">
      <div class="flex flex-row justify-between items-center">
        <div class="flex flex-col">
          {@render userBadge(
            toNpub(event.pubkey) as string,
            profile.display_name || profile.name || event.pubkey,
          )}
          <span class="text-xs text-gray-500"
            >{formatTimestampToDate(event.created_at)}</span
          >
        </div>
        <DualPill left={event.kind} right={typeDisplay} />
      </div>
      {#if profile.banner}
        <div class="ArticleBoxImage flex col justify-center">
          <Img
            src={profile.banner}
            class="rounded w-full max-h-72 object-cover"
            alt="Profile banner"
            onerror={handleBannerError}
          />
        </div>
      {/if}
      <div class="flex flex-row space-x-4 items-center">
        {#if profile.picture}
          <img
            src={profile.picture}
            alt="Profile avatar"
            class="w-16 h-16 rounded-full border"
            onerror={handleAvatarError}
          />
        {/if}
        {@render userBadge(
          toNpub(event.pubkey) as string,
          profile.display_name || profile.name || event.pubkey,
        )}
      </div>
      <div>
        <div class="mt-2 flex flex-col gap-4">
          <dl class="grid grid-cols-1 gap-y-2">
            {#if profile.name}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Name:</dt>
                <dd>{profile.name}</dd>
              </div>
            {/if}
            {#if profile.display_name}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Display Name:</dt>
                <dd>{profile.display_name}</dd>
              </div>
            {/if}
            {#if profile.about}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">About:</dt>
                <dd class="whitespace-pre-line">{profile.about}</dd>
              </div>
            {/if}
            {#if profile.website}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">Website:</dt>
                <dd>
                  <a
                    href={profile.website.match(/^https?:\/\//)
                      ? profile.website
                      : `https://${profile.website}`}
                    target="_blank"
                    rel="noopener"
                    class="underline text-primary-700 dark:text-primary-200"
                  >
                    {profile.website}
                  </a>
                </dd>
              </div>
            {/if}
            {#if profile.nip05}
              <div class="flex gap-2">
                <dt class="font-semibold min-w-[120px]">NIP-05:</dt>
                <dd>{profile.nip05}</dd>
              </div>
            {/if}
            {#if profile.lud16}
              <div class="flex items-center gap-2 mt-4">
                <dt class="font-semibold min-w-[120px]">Lightning Address:</dt>
                <dd class="flex items-center gap-2">
                  <Button
                    class="btn-leather"
                    color="primary"
                    outline
                    onclick={openLnModal}>{profile.lud16}</Button>
                  <Button
                    class="btn-leather"
                    color="primary"
                    onclick={openZapModal}>
                    <ZapOutline size={16} className="mr-1" />
                    Zap
                  </Button>
                </dd>
              </div>
            {/if}
          </dl>
        </div>
      </div>
    </div>
  </Card>

  <Modal
    class="modal-leather"
    title="Lightning Address"
    bind:open={lnModalOpen}
    outsideclose
    size="sm"
  >
    {#if profile.lud16}
      <div>
        <div class="flex flex-row items-center gap-2 mt-2 justify-center w-full text-center">
          <span class="mx-auto">
            <CopyToClipboard icon={false} displayText={lnurl ?? profile.lud16} />
          </span>
        </div>
        <div class="flex flex-col items-center mt-3 space-y-4">
          <QrCode value={lnurl ?? profile.lud16} />
          {#if lnurl}
            <P class="text-xs text-gray-600 dark:text-gray-400">
              This is a bech32-encoded LNURL for your Lightning address.
            </P>
          {:else}
            <P class="text-xs text-yellow-700 dark:text-yellow-300">
              Unable to generate a valid LNURL for this Lightning address. The QR code and copy button use the Lightning address directly, which most wallets support.
            </P>
          {/if}
        </div>
      </div>
    {/if}
  </Modal>

  <ZapModal
    open={zapModalOpen}
    onClose={() => zapModalOpen = false}
    lud16={profile?.lud16}
    lnurl={lnurl}
    recipientPubkey={event.pubkey}
  />
{/if}
