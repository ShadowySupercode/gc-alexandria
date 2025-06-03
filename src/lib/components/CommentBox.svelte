<script lang="ts">
  import { Button, Textarea, Alert } from "flowbite-svelte";
  import { parseBasicmarkup } from "$lib/utils";
  import {
    getEventHash,
    getUserMetadata,
    toNpub,
  } from "$lib/utils";
  import { neventEncode } from "$lib/utils/identifierUtils";
  import { userOutboxRelays } from "$lib/stores/relayStore";
  import { goto } from "$app/navigation";
  import { getNostrClient } from "$lib/nostr/client";
  import type { NostrProfile, NostrEvent } from '$lib/types/nostr';

  // Component props
  let { event: parentEvent, userPubkey, userRelayPreference } = $props<{
    event: NostrEvent;
    userPubkey: string | null;
    userRelayPreference: string[];
  }>();

  // UI state
  let content = $state("");
  let previewContent = $state("");
  let isSubmitting = $state(false);
  let submissionError = $state("");
  let success = $state<{ relay: string; eventId: string } | null>(null);
  let error = $state<string | null>(null);
  let showOtherRelays = $state(false);
  let showFallbackRelays = $state(false);
  let userProfile = $state<NostrProfile | null>(null);
  let lastEvent = $state<NostrEvent | null>(null);

  // Get the Nostr client
  const client = getNostrClient();

  // --- Helpers ---
  function safeNpub(pubkey: string | undefined | null): string {
    const npub = pubkey ? toNpub(pubkey) : '';
    return npub ? npub.slice(0, 8) + '...' : '';
  }

  // Helper function to get tag value from NostrEvent
  function getTagValue<T = string>(event: NostrEvent, tagName: string): T | undefined {
    const matches = event.tags.filter((tag: string[]) => tag[0] === tagName);
    return matches[0]?.[1] as T | undefined;
  }

  // Helper function to get d-tag value from NostrEvent, ensuring it returns a string
  function getDTag(event: NostrEvent): string {
    return getTagValue<string>(event, "d") ?? "";
  }

  async function insertMarkup(prefix: string, suffix: string) {
    const textarea = document.querySelector("textarea");
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = content.substring(start, end);

      content =
        content.substring(0, start) +
        prefix +
        selectedText +
        suffix +
        content.substring(end);

      // Update preview and set cursor position after the inserted markup
      await parseBasicmarkup(content).then((parsed) => {
        previewContent = parsed;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd =
          start + prefix.length + selectedText.length + suffix.length;
      });
    }
  }

  function clearForm() {
    content = "";
    previewContent = "";
    error = null;
    success = null;
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
  }

  // --- Effects ---
  $effect(() => {
    showOtherRelays = $userOutboxRelays.length > 0;
    showFallbackRelays = userRelayPreference.length === 0;
  });

  $effect(() => {
    if (userPubkey) {
      // Get user profile
      const npub = toNpub(userPubkey);
      if (npub) {
        getUserMetadata(npub).then((metadata) => {
          userProfile = metadata;
        });
      }
    }
  });

  $effect(() => {
    if (content) {
      parseBasicmarkup(content).then((parsed) => {
        previewContent = parsed;
      });
    } else {
      previewContent = "";
    }
  });

  // --- Markup Buttons ---
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

  // --- Main Action ---
  async function submitComment() {
    if (!userPubkey || !content.trim()) return;

    try {
      isSubmitting = true;
      submissionError = "";

      const client = getNostrClient();
      if (!client) {
        throw new Error("Nostr client not initialized");
      }

      const user = client.getActiveUser();
      if (!user) {
        throw new Error("No active user found");
      }

      if (!window.nostr) {
        throw new Error("Nostr WebExtension not found. Please install a Nostr WebExtension like Alby or nos2x.");
      }

      // Create the event
      const commentEvent: Omit<NostrEvent, 'id' | 'sig'> = {
        pubkey: userPubkey,
        kind: 1, // Text note
        content: content.trim(),
        tags: [
          ['e', parentEvent.id],
          ['p', parentEvent.pubkey]
        ],
        created_at: Math.floor(Date.now() / 1000)
      };

      // Calculate event ID
      const eventId = getEventHash(commentEvent);

      // Sign the event using the WebExtension
      const signedEvent = await window.nostr.signEvent({
        kind: commentEvent.kind,
        created_at: commentEvent.created_at,
        tags: commentEvent.tags,
        content: commentEvent.content,
        pubkey: commentEvent.pubkey
      });

      // Combine the signed event with the original event data
      const publishedEvent: NostrEvent = {
        ...commentEvent,
        id: signedEvent.id,
        sig: signedEvent.sig
      };

      await client.publish(publishedEvent);

      // Clear the form
      content = "";
      isSubmitting = false;

      // Store the event for later use
      lastEvent = publishedEvent;
      // Navigate to the event page
      const nevent = neventEncode(publishedEvent, userRelayPreference);
      goto(`/events?id=${nevent}`);
    } catch (error) {
      console.error('Failed to submit comment:', error);
      submissionError = error instanceof Error ? error.message : 'Failed to submit comment';
      isSubmitting = false;
    }
  }
</script>

<div class="w-full space-y-4">
  <div class="flex flex-wrap gap-2">
    {#each markupButtons as button}
      <Button size="xs" onclick={button.action}>{button.label}</Button>
    {/each}
    <Button size="xs" color="alternative" onclick={removeFormatting}
      >Remove Formatting</Button
    >
    <Button size="xs" color="alternative" onclick={clearForm}>Clear</Button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <Textarea
        bind:value={content}
        placeholder="Write your comment..."
        rows={10}
        class="w-full"
      />
    </div>
    <div class="prose dark:prose-invert max-w-none p-4 border rounded-lg">
      {@html previewContent}
    </div>
  </div>

  {#if submissionError}
    <Alert color="red" dismissable>
      {submissionError}
      {#if showOtherRelays}
        <Button size="xs" class="mt-2" onclick={() => submitComment()}>Try Other Relays</Button>
      {/if}
      {#if showFallbackRelays}
        <Button size="xs" class="mt-2" onclick={() => submitComment()}>Try Fallback Relays</Button>
      {/if}
    </Alert>
  {/if}

  {#if success}
    <Alert color="green" dismissable>
      Comment published successfully to {success.relay}!
      {#if lastEvent}
        <a
          href="/events?id={neventEncode(lastEvent, userRelayPreference)}"
          class="text-primary-600 dark:text-primary-500 hover:underline"
        >
          View comment
        </a>
      {/if}
    </Alert>
  {/if}

  <div class="flex justify-end items-center gap-4">
    {#if userProfile}
      {@const { picture, name, displayName } = userProfile}
      <div class="flex items-center gap-2 text-sm">
        {#if picture}
          <img
            src={picture}
            alt={name ?? 'Profile'}
            class="w-8 h-8 rounded-full"
            onerror={(e) => {
              const img = e.target as HTMLImageElement;
              img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(img.alt)}`;
            }}
          />
        {/if}
        <span class="text-gray-700 dark:text-gray-300">
          {(displayName ?? name) || safeNpub(userPubkey)}
        </span>
      </div>
    {:else}
      <span class="text-gray-700 dark:text-gray-300">
        {safeNpub(userPubkey)}
      </span>
    {/if}
    <Button
      onclick={() => submitComment()}
      disabled={isSubmitting || !content.trim() || !userPubkey}
      class="w-full md:w-auto"
    >
      {#if !userPubkey}
        Not Signed In
      {:else if isSubmitting}
        Publishing...
      {:else}
        Post Comment
      {/if}
    </Button>
  </div>

  {#if !userPubkey}
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
