<script lang="ts">
  import { Button, Textarea, Alert } from "flowbite-svelte";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { nip19 } from "nostr-tools";
  import {
    getUserMetadata,
    toNpub,
  } from "$lib/utils/nostrUtils";

  // Extend NostrProfile locally to include pubkey for mention search results
  type NostrProfile = {
    name?: string;
    displayName?: string;
    nip05?: string;
    picture?: string;
    about?: string;
    banner?: string;
    website?: string;
    lud16?: string;
    pubkey?: string;
  };
  import { activePubkey } from '$lib/ndk';
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import {
    extractRootEventInfo,
    extractParentEventInfo,
    buildReplyTags,
    createSignedEvent,
    publishEvent,
    navigateToEvent,
  } from "$lib/utils/nostrEventService";
  import { get } from 'svelte/store';
  import { ndkInstance } from '$lib/ndk';
  import type NDK from '@nostr-dev-kit/ndk';
  import { NDKRelaySet } from '@nostr-dev-kit/ndk';
  import { NDKRelay } from '@nostr-dev-kit/ndk';
  import { communityRelay } from '$lib/consts';

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

  // Add state for modals and search
  let showMentionModal = $state(false);
  let showWikilinkModal = $state(false);
  let mentionSearch = $state('');
  let mentionResults = $state<NostrProfile[]>([]);
  let mentionLoading = $state(false);
  let wikilinkTarget = $state('');
  let wikilinkLabel = $state('');
  let mentionSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let nip05Search = $state('');
  let nip05Results = $state<NostrProfile[]>([]);
  let nip05Loading = $state(false);

  // Add a cache for pubkeys with kind 1 events on communityRelay
  const forestCache: Record<string, boolean> = {};

  async function checkForest(pubkey: string): Promise<boolean> {
    if (forestCache[pubkey] !== undefined) {
      return forestCache[pubkey];
    }
    // Query the communityRelay for kind 1 events by this pubkey
    try {
      const relayUrl = communityRelay[0];
      const ws = new WebSocket(relayUrl);
      return await new Promise((resolve) => {
        ws.onopen = () => {
          // NIP-01 filter for kind 1 events by pubkey
          ws.send(JSON.stringify([
            'REQ', 'alexandria-forest', { kinds: [1], authors: [pubkey], limit: 1 }
          ]));
        };
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data[0] === 'EVENT' && data[2]?.kind === 1) {
            forestCache[pubkey] = true;
            ws.close();
            resolve(true);
          } else if (data[0] === 'EOSE') {
            forestCache[pubkey] = false;
            ws.close();
            resolve(false);
          }
        };
        ws.onerror = () => {
          forestCache[pubkey] = false;
          ws.close();
          resolve(false);
        };
      });
    } catch {
      forestCache[pubkey] = false;
      return false;
    }
  }

  // Track which pubkeys have forest status loaded
  let forestStatus: Record<string, boolean> = $state({});

  $effect(() => {
    // When mentionResults change, check forest status for each
    for (const profile of mentionResults) {
      if (profile.pubkey && forestStatus[profile.pubkey] === undefined) {
        checkForest(profile.pubkey).then((hasForest) => {
          forestStatus = { ...forestStatus, [profile.pubkey!]: hasForest };
        });
      }
    }
  });

  $effect(() => {
    if (!activePubkey) {
      userProfile = null;
      error = null;
    }
  });

  $effect(() => {
    const trimmedPubkey = $activePubkey?.trim();
    const npub = toNpub(trimmedPubkey);
    if (npub) {
      // Call an async function, but don't make the effect itself async
      getUserMetadata(npub).then(metadata => {
        userProfile = metadata;
      });
    } else if (trimmedPubkey) {
      userProfile = null;
      error = 'Invalid public key: must be a 64-character hex string.';
    } else {
      userProfile = null;
      error = null;
    }
  });

  $effect(() => {
    if (!success) return;
  
    content = '';
    preview = '';
    }
  );

  // Markup buttons
  const markupButtons = [
    { label: "Bold", action: () => insertMarkup("**", "**") },
    { label: "Italic", action: () => insertMarkup("_", "_") },
    { label: "Strike", action: () => insertMarkup("~~", "~~") },
    { label: "Link", action: () => insertMarkup("[", "](url)") },
    { label: "Image", action: () => insertMarkup("![", "](url)") },
    { label: "Quote", action: () => insertMarkup("> ", "") },
    { label: "List", action: () => insertMarkup("* ", "") },
    { label: "Numbered List", action: () => insertMarkup("1. ", "") },
    { label: "Hashtag", action: () => insertMarkup("#", "") },
    { label: '@', action: () => { mentionSearch = ''; mentionResults = []; showMentionModal = true; } },
    { label: 'Wikilink', action: () => { showWikilinkModal = true; } },
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

  async function handleSubmit(
    useOtherRelays = false,
    useFallbackRelays = false,
  ) {
    isSubmitting = true;
    error = null;
    success = null;

    try {
      const pk = $activePubkey || '';
      const npub = toNpub(pk);
      
      if (!npub) {
        throw new Error('Invalid public key: must be a 64-character hex string.');
      }
      
      if (props.event.kind === undefined || props.event.kind === null) {
        throw new Error('Invalid event: missing kind');
      }

      const parent = props.event;
      // Use the same kind as parent for replies, or 1111 for generic replies
      const kind = parent.kind === 1 ? 1 : 1111;

      // Extract root and parent event information
      const rootInfo = extractRootEventInfo(parent);
      const parentInfo = extractParentEventInfo(parent);

      // Build tags for the reply
      const tags = buildReplyTags(parent, rootInfo, parentInfo, kind);

      // Create and sign the event
      const { event: signedEvent } = await createSignedEvent(content, pk, kind, tags);

      // Publish the event
      const result = await publishEvent(
        signedEvent,
        useOtherRelays,
        useFallbackRelays,
        props.userRelayPreference
      );

      if (result.success) {
        success = { relay: result.relay!, eventId: result.eventId! };
        // Navigate to the published event
        navigateToEvent(result.eventId!);
      } else {
        if (!useOtherRelays && !useFallbackRelays) {
          showOtherRelays = true;
          error = "Failed to publish to primary relays. Would you like to try the other relays?";
        } else if (useOtherRelays && !useFallbackRelays) {
          showFallbackRelays = true;
          error = "Failed to publish to other relays. Would you like to try the fallback relays?";
        } else {
          error = result.error || "Failed to publish to any relays. Please try again later.";
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "An error occurred";
    } finally {
      isSubmitting = false;
    }
  }

  // Insert at cursor helper
  function insertAtCursor(text: string) {
    const textarea = document.querySelector('textarea');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    content = content.substring(0, start) + text + content.substring(end);
    updatePreview();
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  }

  // Real Nostr profile search logic
  async function searchMentions() {
    mentionLoading = true;
    mentionResults = [];
    const searchTerm = mentionSearch.trim();
    if (!searchTerm) {
      mentionLoading = false;
      return;
    }
    // NIP-05 pattern: user@domain
    if (/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(searchTerm)) {
      try {
        const [name, domain] = searchTerm.split('@');
        const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
        const data = await res.json();
        const pubkey = data.names?.[name];
        if (pubkey) {
          // Fetch kind:0 event for pubkey from theforest first
          const ndk: NDK = get(ndkInstance);
          if (!ndk) {
            mentionLoading = false;
            return;
          }
          // Try theforest relay first
          const { communityRelay } = await import('$lib/consts');
          const forestRelays = communityRelay.map(url => ndk.pool.relays.get(url) ?? ndk.pool.getRelay(url));
          let events = await ndk.fetchEvents({ kinds: [0], authors: [pubkey] }, { closeOnEose: true }, new NDKRelaySet(new Set(forestRelays), ndk));
          let eventArr = Array.from(events);
          if (eventArr.length === 0) {
            // Fallback to all relays
            const relaySet = new NDKRelaySet(new Set(Array.from(ndk.pool.relays.values())), ndk);
            events = await ndk.fetchEvents({ kinds: [0], authors: [pubkey] }, { closeOnEose: true }, relaySet);
            eventArr = Array.from(events);
          }
          if (eventArr.length > 0) {
            try {
              const event = eventArr[0];
              const profileData = JSON.parse(event.content);
              mentionResults = [{ ...profileData, pubkey }];
            } catch {
              mentionResults = [];
            }
          } else {
            mentionResults = [];
          }
        } else {
          mentionResults = [];
        }
      } catch {
        mentionResults = [];
      }
      mentionLoading = false;
      return;
    }
    // Fallback: search by display name or name
    const ndk: NDK = get(ndkInstance);
    if (!ndk) {
      mentionLoading = false;
      return;
    }
    // Try theforest relay first
    const { communityRelay } = await import('$lib/consts');
    const forestRelays = communityRelay.map(url => ndk.pool.relays.get(url) ?? ndk.pool.getRelay(url));
    let foundProfiles: Record<string, { profile: NostrProfile; created_at: number }> = {};
    let relaySet = new NDKRelaySet(new Set(forestRelays), ndk);
    let filter = { kinds: [0] };
    let sub = ndk.subscribe(filter, { closeOnEose: true }, relaySet);
    sub.on('event', (event: any) => {
      try {
        if (!event.content) return;
        const profileData = JSON.parse(event.content);
        const displayName = profileData.display_name || profileData.displayName || '';
        const name = profileData.name || '';
        const searchLower = searchTerm.toLowerCase();
        if (
          displayName.toLowerCase().includes(searchLower) ||
          name.toLowerCase().includes(searchLower)
        ) {
          // Deduplicate by pubkey, keep only newest
          const pubkey = event.pubkey;
          const created_at = event.created_at || 0;
          if (!foundProfiles[pubkey] || foundProfiles[pubkey].created_at < created_at) {
            foundProfiles[pubkey] = {
              profile: { ...profileData, pubkey },
              created_at,
            };
          }
        }
      } catch {}
    });
    sub.on('eose', async () => {
      const forestResults = Object.values(foundProfiles).map(x => x.profile);
      if (forestResults.length > 0) {
        mentionResults = forestResults;
        mentionLoading = false;
        return;
      }
      // Fallback to all relays
      foundProfiles = {};
      const allRelays: NDKRelay[] = Array.from(ndk.pool.relays.values());
      relaySet = new NDKRelaySet(new Set(allRelays), ndk);
      sub = ndk.subscribe(filter, { closeOnEose: true }, relaySet);
      sub.on('event', (event: any) => {
        try {
          if (!event.content) return;
          const profileData = JSON.parse(event.content);
          const displayName = profileData.display_name || profileData.displayName || '';
          const name = profileData.name || '';
          const searchLower = searchTerm.toLowerCase();
          if (
            displayName.toLowerCase().includes(searchLower) ||
            name.toLowerCase().includes(searchLower)
          ) {
            // Deduplicate by pubkey, keep only newest
            const pubkey = event.pubkey;
            const created_at = event.created_at || 0;
            if (!foundProfiles[pubkey] || foundProfiles[pubkey].created_at < created_at) {
              foundProfiles[pubkey] = {
                profile: { ...profileData, pubkey },
                created_at,
              };
            }
          }
        } catch {}
      });
      sub.on('eose', () => {
        mentionResults = Object.values(foundProfiles).map(x => x.profile);
        mentionLoading = false;
      });
    });
  }

  function selectMention(profile: NostrProfile) {
    // Always insert nostr:npub... for the selected profile
    const npub = toNpub(profile.pubkey);
    if (profile && npub) {
      insertAtCursor(`nostr:${npub}`);
    }
    showMentionModal = false;
    mentionSearch = '';
    mentionResults = [];
  }

  function insertWikilink() {
    if (!wikilinkTarget.trim()) return;
    let markup = '';
    if (wikilinkLabel.trim()) {
      markup = `[[${wikilinkTarget}|${wikilinkLabel}]]`;
    } else {
      markup = `[[${wikilinkTarget}]]`;
    }
    insertAtCursor(markup);
    showWikilinkModal = false;
    wikilinkTarget = '';
    wikilinkLabel = '';
  }

  // Add a helper to shorten npub
  function shortenNpub(npub: string | undefined) {
    if (!npub) return '';
    return npub.slice(0, 8) + '…' + npub.slice(-4);
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

  <!-- Mention Modal -->
  {#if showMentionModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-2">Mention User</h3>
        <input
          type="text"
          class="w-full border rounded p-2 mb-2"
          placeholder="Search display name or npub..."
          bind:value={mentionSearch}
        />
        <Button size="xs" color="primary" class="mb-2" onclick={searchMentions} disabled={mentionLoading || !mentionSearch.trim()}>Search</Button>
        {#if mentionLoading}
          <div>Searching...</div>
        {:else if mentionResults.length > 0}
          <ul>
            {#each mentionResults as profile}
              <button type="button" class="w-full text-left cursor-pointer hover:bg-gray-200 p-2 rounded flex items-center gap-3" onclick={() => selectMention(profile)}>
                {#if profile.picture}
                  <img src={profile.picture} alt="Profile" class="w-8 h-8 rounded-full object-cover" />
                {/if}
                <div class="flex flex-col text-left">
                  <span class="font-semibold flex items-center gap-1">
                    {profile.displayName || profile.name || mentionSearch}
                    {#if profile.pubkey && forestStatus[profile.pubkey]}
                      <span title="Has posted to the forest">🌲</span>
                    {/if}
                  </span>
                  {#if profile.nip05}
                    <span class="text-xs text-gray-500 flex items-center gap-1">
                      <svg class="inline w-4 h-4 text-primary-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                      {profile.nip05}
                    </span>
                  {/if}
                  <span class="text-xs text-gray-400 font-mono">{shortenNpub(profile.pubkey)}</span>
                </div>
              </button>
            {/each}
          </ul>
        {:else}
          <div>No results</div>
        {/if}
        <div class="flex justify-end mt-4">
          <Button size="xs" color="alternative" onclick={() => { showMentionModal = false; }}>Cancel</Button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Wikilink Modal -->
  {#if showWikilinkModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-2">Insert Wikilink</h3>
        <input
          type="text"
          class="w-full border rounded p-2 mb-2"
          placeholder="Target page (e.g. target page or target-page)"
          bind:value={wikilinkTarget}
        />
        <input
          type="text"
          class="w-full border rounded p-2 mb-2"
          placeholder="Display text (optional)"
          bind:value={wikilinkLabel}
        />
        <div class="flex justify-end gap-2 mt-4">
          <Button size="xs" color="primary" on:click={insertWikilink}>Insert</Button>
          <Button size="xs" color="alternative" on:click={() => { showWikilinkModal = false; }}>Cancel</Button>
        </div>
      </div>
    </div>
  {/if}

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
    <div class="prose dark:prose-invert max-w-none p-4 border border-gray-300 dark:border-gray-700 rounded-lg">
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
            nip19.npubEncode($activePubkey || '').slice(0, 8) + "..."}
        </span>
      </div>
    {/if}
    <Button
      on:click={() => handleSubmit()}
      disabled={isSubmitting || !content.trim() || !$activePubkey}
      class="w-full md:w-auto"
    >
      {#if !$activePubkey}
        Not Signed In
      {:else if isSubmitting}
        Publishing...
      {:else}
        Post Comment
      {/if}
    </Button>
  </div>

  {#if !$activePubkey}
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
