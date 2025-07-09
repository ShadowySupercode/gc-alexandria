<script lang="ts">
  import { Button, Textarea, Alert } from "flowbite-svelte";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { nip19 } from "nostr-tools";
  import {
    getEventHash,
    signEvent,
    getUserMetadata,
    type NostrProfile,
  } from "$lib/utils/nostrUtils";
  import { standardRelays, fallbackRelays } from "$lib/consts";
  import { userRelays } from "$lib/stores/relayStore";
  import { get } from "svelte/store";
  import { activePubkey } from '$lib/ndk';
  import { goto } from "$app/navigation";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { onMount } from "svelte";

  const props = $props<{
    event: NDKEvent;
    userRelayPreference: boolean;
  }>();

  let content = $state("");
  let preview = $state("");
  let isSubmitting = $state(false);
  let success = $state<{ relay: string; eventId: string } | null>(null);
  let error = $state<string | null>(null);
  let showOtherRelays = $state(false);
  let showFallbackRelays = $state(false);
  let userProfile = $state<NostrProfile | null>(null);
  let pubkey = $state<string | null>(null);
  $effect(() => {
    pubkey = get(activePubkey);
  });

  // Fetch user profile on mount
  onMount(() => {
    const trimmedPubkey = pubkey?.trim();
    if (trimmedPubkey && /^[a-fA-F0-9]{64}$/.test(trimmedPubkey)) {
      (async () => {
        const npub = nip19.npubEncode(trimmedPubkey);
        userProfile = await getUserMetadata(npub);
        error = null;
      })();
    } else if (trimmedPubkey) {
      userProfile = null;
      error = 'Invalid public key: must be a 64-character hex string.';
    } else {
      userProfile = null;
      error = null;
    }
  });

  // Markup buttons
  const markupButtons = [
    { label: "Bold", action: () => insertMarkup("**", "**") },
    { label: "Italic", action: () => insertMarkup("_", "_") },
    { label: "Strike", action: () => insertMarkup("~~", "~~") },
    { label: "Link", action: () => insertMarkup("[", "](url)") },
    { label: "Image", action: () => insertMarkup("![", "](url)") },
    { label: "Quote", action: () => insertMarkup("> ", "") },
    { label: "List", action: () => insertMarkup("- ", "") },
    { label: "Numbered List", action: () => insertMarkup("1. ", "") },
    { label: "Hashtag", action: () => insertMarkup("#", "") },
  ];

  function insertMarkup(prefix: string, suffix: string) {
    const textarea = document.querySelector("textarea");
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    content =
      content.substring(0, start) +
      prefix +
      selectedText +
      suffix +
      content.substring(end);
    updatePreview();

    // Set cursor position after the inserted markup
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd =
        start + prefix.length + selectedText.length + suffix.length;
    }, 0);
  }

  async function updatePreview() {
    preview = await parseBasicmarkup(content);
  }

  function clearForm() {
    content = "";
    preview = "";
    error = null;
    success = null;
    showOtherRelays = false;
    showFallbackRelays = false;
  }

  function removeFormatting() {
    content = content
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/^>\s*/gm, "")
      .replace(/^[-*]\s*/gm, "")
      .replace(/^\d+\.\s*/gm, "")
      .replace(/#(\w+)/g, "$1");
    updatePreview();
  }

  // Helper functions to ensure relay and pubkey are always strings
  function getRelayString(relay: any): string {
    if (!relay) return '';
    if (typeof relay === 'string') return relay;
    if (typeof relay.url === 'string') return relay.url;
    return '';
  }

  function getPubkeyString(pubkey: any): string {
    if (!pubkey) return '';
    if (typeof pubkey === 'string') return pubkey;
    if (typeof pubkey.hex === 'function') return pubkey.hex();
    if (typeof pubkey.pubkey === 'string') return pubkey.pubkey;
    return '';
  }

  async function handleSubmit(
    useOtherRelays = false,
    useFallbackRelays = false,
  ) {
    isSubmitting = true;
    error = null;
    success = null;

    try {
      if (!pubkey || !/^[a-fA-F0-9]{64}$/.test(pubkey)) {
        throw new Error('Invalid public key: must be a 64-character hex string.');
      }
      if (props.event.kind === undefined || props.event.kind === null) {
        throw new Error('Invalid event: missing kind');
      }

      // Always use kind 1111 for comments
      const kind = 1111;
      const parent = props.event;
      // Try to extract root info from parent tags (NIP-22 threading)
      let rootKind = parent.kind;
      let rootPubkey = getPubkeyString(parent.pubkey);
      let rootRelay = getRelayString(parent.relay);
      let rootId = parent.id;
      let rootAddress = '';
      let parentRelay = getRelayString(parent.relay);
      let parentAddress = '';
      let parentKind = parent.kind;
      let parentPubkey = getPubkeyString(parent.pubkey);
      // Try to find root event info from tags (E/A/I)
      let isRootA = false;
      let isRootI = false;
      if (parent.tags) {
        const rootE = parent.tags.find((t: string[]) => t[0] === 'E');
        const rootA = parent.tags.find((t: string[]) => t[0] === 'A');
        const rootI = parent.tags.find((t: string[]) => t[0] === 'I');
        isRootA = !!rootA;
        isRootI = !!rootI;
        if (rootE) {
          rootId = rootE[1];
          rootRelay = getRelayString(rootE[2]);
          rootPubkey = getPubkeyString(rootE[3] || rootPubkey);
          rootKind = parent.tags.find((t: string[]) => t[0] === 'K')?.[1] || rootKind;
        } else if (rootA) {
          rootAddress = rootA[1];
          rootRelay = getRelayString(rootA[2]);
          rootPubkey = getPubkeyString(parent.tags.find((t: string[]) => t[0] === 'P')?.[1] || rootPubkey);
          rootKind = parent.tags.find((t: string[]) => t[0] === 'K')?.[1] || rootKind;
        } else if (rootI) {
          rootAddress = rootI[1];
          rootKind = parent.tags.find((t: string[]) => t[0] === 'K')?.[1] || rootKind;
        }
      }
      // Compose tags according to NIP-22
      const tags: string[][] = [];
      // Root scope (uppercase)
      if (rootAddress) {
        tags.push([isRootA ? 'A' : isRootI ? 'I' : 'E', rootAddress || rootId, rootRelay, rootPubkey]);
      } else {
        tags.push(['E', rootId, rootRelay, rootPubkey]);
      }
      tags.push(['K', String(rootKind), '', '']);
      tags.push(['P', rootPubkey, rootRelay, '']);
      // Parent (lowercase)
      if (parentAddress) {
        tags.push([isRootA ? 'a' : isRootI ? 'i' : 'e', parentAddress || parent.id, parentRelay, parentPubkey]);
      } else {
        tags.push(['e', parent.id, parentRelay, parentPubkey]);
      }
      tags.push(['k', String(parentKind), '', '']);
      tags.push(['p', parentPubkey, parentRelay, '']);

      // Create a completely plain object to avoid proxy cloning issues
      const eventToSign = {
        kind: Number(kind),
        created_at: Number(Math.floor(Date.now() / 1000)),
        tags: tags.map(tag => [String(tag[0]), String(tag[1]), String(tag[2] || ''), String(tag[3] || '')]),
        content: String(content),
        pubkey: String(pubkey),
      };

      let sig, id;
      if (typeof window !== 'undefined' && window.nostr && window.nostr.signEvent) {
        const signed = await window.nostr.signEvent(eventToSign);
        sig = signed.sig as string;
        if ('id' in signed) {
          id = signed.id as string;
        } else {
          id = getEventHash(eventToSign);
        }
      } else {
        id = getEventHash(eventToSign);
        sig = await signEvent(eventToSign);
      }

      const signedEvent = {
        ...eventToSign,
        id,
        sig,
      };

      // Determine which relays to use
      let relays = props.userRelayPreference ? get(userRelays) : standardRelays;
      if (useOtherRelays) {
        relays = props.userRelayPreference ? standardRelays : get(userRelays);
      }
      if (useFallbackRelays) {
        relays = fallbackRelays;
      }

      // Try to publish to relays
      let published = false;
      for (const relayUrl of relays) {
        try {
          const ws = new WebSocket(relayUrl);
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error("Timeout"));
            }, 5000);

            ws.onopen = () => {
              ws.send(JSON.stringify(["EVENT", signedEvent]));
            };

            ws.onmessage = (e) => {
              const [type, id, ok, message] = JSON.parse(e.data);
              if (type === "OK" && id === signedEvent.id) {
                clearTimeout(timeout);
                if (ok) {
                  published = true;
                  success = { relay: relayUrl, eventId: signedEvent.id };
                  ws.close();
                  resolve();
                } else {
                  ws.close();
                  reject(new Error(message));
                }
              }
            };

            ws.onerror = () => {
              clearTimeout(timeout);
              ws.close();
              reject(new Error("WebSocket error"));
            };
          });
          if (published) break;
        } catch (e) {
          console.error(`Failed to publish to ${relayUrl}:`, e);
        }
      }

      if (!published) {
        if (!useOtherRelays && !useFallbackRelays) {
          showOtherRelays = true;
          error =
            "Failed to publish to primary relays. Would you like to try the other relays?";
        } else if (useOtherRelays && !useFallbackRelays) {
          showFallbackRelays = true;
          error =
            "Failed to publish to other relays. Would you like to try the fallback relays?";
        } else {
          error = "Failed to publish to any relays. Please try again later.";
        }
      } else {
        // Navigate to the event page
        const nevent = nip19.neventEncode({ id: signedEvent.id });
        goto(`/events?id=${nevent}`);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "An error occurred";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="w-full space-y-4">
  <div class="flex flex-wrap gap-2">
    {#each markupButtons as button}
      <Button size="xs" on:click={button.action}>{button.label}</Button>
    {/each}
    <Button size="xs" color="alternative" on:click={removeFormatting}
      >Remove Formatting</Button
    >
    <Button size="xs" color="alternative" on:click={clearForm}>Clear</Button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <Textarea
        bind:value={content}
        on:input={updatePreview}
        placeholder="Write your comment..."
        rows={10}
        class="w-full"
      />
    </div>
    <div class="prose dark:prose-invert max-w-none p-4 border rounded-lg">
      {@html preview}
    </div>
  </div>

  {#if error}
    <Alert color="red" dismissable>
      {error}
      {#if showOtherRelays}
        <Button size="xs" class="mt-2" on:click={() => handleSubmit(true)}
          >Try Other Relays</Button
        >
      {/if}
      {#if showFallbackRelays}
        <Button
          size="xs"
          class="mt-2"
          on:click={() => handleSubmit(false, true)}>Try Fallback Relays</Button
        >
      {/if}
    </Alert>
  {/if}

  {#if success}
    <Alert color="green" dismissable>
      Comment published successfully to {success.relay}!<br/>
      Event ID: <span class="font-mono">{success.eventId}</span>
      <a
        href="/events?id={nip19.neventEncode({ id: success.eventId })}"
        class="text-primary-600 dark:text-primary-500 hover:underline ml-2"
      >
        View your comment
      </a>
    </Alert>
  {/if}

  <div class="flex justify-end items-center gap-4">
    {#if userProfile}
      <div class="flex items-center gap-2 text-sm">
        {#if userProfile.picture}
          <img
            src={userProfile.picture}
            alt={userProfile.name || "Profile"}
            class="w-8 h-8 rounded-full"
            onerror={(e) => {
              const img = e.target as HTMLImageElement;
              img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(img.alt)}`;
            }}
          />
        {/if}
        <span class="text-gray-900 dark:text-gray-100">
          {userProfile.displayName ||
            userProfile.name ||
            nip19.npubEncode(pubkey || '').slice(0, 8) + "..."}
        </span>
      </div>
    {/if}
    <Button
      on:click={() => handleSubmit()}
      disabled={isSubmitting || !content.trim() || !pubkey}
      class="w-full md:w-auto"
    >
      {#if !pubkey}
        Not Signed In
      {:else if isSubmitting}
        Publishing...
      {:else}
        Post Comment
      {/if}
    </Button>
  </div>

  {#if !pubkey}
    <Alert color="yellow" class="mt-4">
      Please sign in to post comments. Your comments will be signed with your
      current account.
    </Alert>
  {/if}
</div>

<style>
  /* Add styles for disabled state */
  :global(.disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
