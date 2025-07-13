<script lang="ts">
  import { Button, Textarea, Alert } from "flowbite-svelte";
  import { parseBasicmarkup } from "$lib/utils/markup/basicMarkupParser";
  import { nip19 } from "nostr-tools";
  import {
    getUserMetadata,
    toNpub,
    type NostrProfile,
  } from "$lib/utils/nostrUtils";
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
