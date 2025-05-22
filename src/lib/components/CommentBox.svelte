<script lang="ts">
  import { Button, Textarea, Alert } from 'flowbite-svelte';
  import { parseBasicmarkup } from '$lib/utils/markup/basicMarkupParser';
  import { nip19 } from 'nostr-tools';
  import { getEventHash, signEvent, getUserMetadata, type NostrProfile } from '$lib/utils/nostrUtils';
  import { standardRelays, fallbackRelays } from '$lib/consts';
  import { userRelays } from '$lib/stores/relayStore';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import { onMount } from 'svelte';

  const props = $props<{
    event: NDKEvent;
    userPubkey: string;
    userRelayPreference: boolean;
  }>();

  let content = $state('');
  let preview = $state('');
  let isSubmitting = $state(false);
  let success = $state<{ relay: string; eventId: string } | null>(null);
  let error = $state<string | null>(null);
  let showOtherRelays = $state(false);
  let showFallbackRelays = $state(false);
  let userProfile = $state<NostrProfile | null>(null);

  // Fetch user profile on mount
  onMount(async () => {
    if (props.userPubkey) {
      const npub = nip19.npubEncode(props.userPubkey);
      userProfile = await getUserMetadata(npub);
    }
  });

  // Markup buttons
  const markupButtons = [
    { label: 'Bold', action: () => insertMarkup('**', '**') },
    { label: 'Italic', action: () => insertMarkup('_', '_') },
    { label: 'Strike', action: () => insertMarkup('~~', '~~') },
    { label: 'Link', action: () => insertMarkup('[', '](url)') },
    { label: 'Image', action: () => insertMarkup('![', '](url)') },
    { label: 'Quote', action: () => insertMarkup('> ', '') },
    { label: 'List', action: () => insertMarkup('- ', '') },
    { label: 'Numbered List', action: () => insertMarkup('1. ', '') },
    { label: 'Hashtag', action: () => insertMarkup('#', '') }
  ];

  function insertMarkup(prefix: string, suffix: string) {
    const textarea = document.querySelector('textarea');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    
    content = content.substring(0, start) + prefix + selectedText + suffix + content.substring(end);
    updatePreview();
    
    // Set cursor position after the inserted markup
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + prefix.length + selectedText.length + suffix.length;
    }, 0);
  }

  async function updatePreview() {
    preview = await parseBasicmarkup(content);
  }

  function clearForm() {
    content = '';
    preview = '';
    error = null;
    success = null;
    showOtherRelays = false;
    showFallbackRelays = false;
  }

  function removeFormatting() {
    content = content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/^>\s*/gm, '')
      .replace(/^[-*]\s*/gm, '')
      .replace(/^\d+\.\s*/gm, '')
      .replace(/#(\w+)/g, '$1');
    updatePreview();
  }

  async function handleSubmit(useOtherRelays = false, useFallbackRelays = false) {
    isSubmitting = true;
    error = null;
    success = null;

    try {
      if (!props.event.kind) {
        throw new Error('Invalid event: missing kind');
      }

      const kind = props.event.kind === 1 ? 1 : 1111;
      const tags: string[][] = [];

      if (kind === 1) {
        // NIP-10 reply
        tags.push(['e', props.event.id, '', 'reply']);
        tags.push(['p', props.event.pubkey]);
        if (props.event.tags) {
          const rootTag = props.event.tags.find((t: string[]) => t[0] === 'e' && t[3] === 'root');
          if (rootTag) {
            tags.push(['e', rootTag[1], '', 'root']);
          }
          // Add all p tags from the parent event
          props.event.tags.filter((t: string[]) => t[0] === 'p').forEach((t: string[]) => {
            if (!tags.some((pt: string[]) => pt[1] === t[1])) {
              tags.push(['p', t[1]]);
            }
          });
        }
      } else {
        // NIP-22 comment
        tags.push(['E', props.event.id, '', props.event.pubkey]);
        tags.push(['K', props.event.kind.toString()]);
        tags.push(['P', props.event.pubkey]);
        tags.push(['e', props.event.id, '', props.event.pubkey]);
        tags.push(['k', props.event.kind.toString()]);
        tags.push(['p', props.event.pubkey]);
      }

      const eventToSign = {
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
        pubkey: props.userPubkey
      };

      const id = getEventHash(eventToSign);
      const sig = await signEvent(eventToSign);

      const signedEvent = {
        ...eventToSign,
        id,
        sig
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
              reject(new Error('Timeout'));
            }, 5000);

            ws.onopen = () => {
              ws.send(JSON.stringify(['EVENT', signedEvent]));
            };

            ws.onmessage = (e) => {
              const [type, id, ok, message] = JSON.parse(e.data);
              if (type === 'OK' && id === signedEvent.id) {
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
              reject(new Error('WebSocket error'));
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
          error = 'Failed to publish to primary relays. Would you like to try the other relays?';
        } else if (useOtherRelays && !useFallbackRelays) {
          showFallbackRelays = true;
          error = 'Failed to publish to other relays. Would you like to try the fallback relays?';
        } else {
          error = 'Failed to publish to any relays. Please try again later.';
        }
      } else {
        // Navigate to the event page
        const nevent = nip19.neventEncode({ id: signedEvent.id });
        goto(`/events?id=${nevent}`);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
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
    <Button size="xs" color="alternative" on:click={removeFormatting}>Remove Formatting</Button>
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
        <Button size="xs" class="mt-2" on:click={() => handleSubmit(true)}>Try Other Relays</Button>
      {/if}
      {#if showFallbackRelays}
        <Button size="xs" class="mt-2" on:click={() => handleSubmit(false, true)}>Try Fallback Relays</Button>
      {/if}
    </Alert>
  {/if}

  {#if success}
    <Alert color="green" dismissable>
      Comment published successfully to {success.relay}!
      <a href="/events?id={nip19.neventEncode({ id: success.eventId })}" class="text-primary-600 dark:text-primary-500 hover:underline">
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
            alt={userProfile.name || 'Profile'} 
            class="w-8 h-8 rounded-full"
            onerror={(e) => {
              const img = e.target as HTMLImageElement;
              img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(img.alt)}`;
            }}
          />
        {/if}
        <span class="text-gray-700 dark:text-gray-300">
          {userProfile.displayName || userProfile.name || nip19.npubEncode(props.userPubkey).slice(0, 8) + '...'}
        </span>
      </div>
    {/if}
    <Button
      on:click={() => handleSubmit()}
      disabled={isSubmitting || !content.trim() || !props.userPubkey}
      class="w-full md:w-auto"
    >
      {#if !props.userPubkey}
        Not Signed In
      {:else if isSubmitting}
        Publishing...
      {:else}
        Post Comment
      {/if}
    </Button>
  </div>

  {#if !props.userPubkey}
    <Alert color="yellow" class="mt-4">
      Please sign in to post comments. Your comments will be signed with your current account.
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