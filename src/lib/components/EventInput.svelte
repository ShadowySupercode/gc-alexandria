<script lang='ts'>
  import { getTitleTagForEvent, getDTagForEvent, requiresDTag, hasDTag, validateNotAsciidoc, validateAsciiDoc, build30040EventSet, titleToDTag } from '$lib/utils/event_input_utils';
  import { get } from 'svelte/store';
  import { ndkInstance, activePubkey } from '$lib/ndk';
  import { NDKEvent as NDKEventClass } from '@nostr-dev-kit/ndk';
  import type { NDKEvent } from '$lib/utils/nostrUtils';
  import { standardRelays } from '$lib/consts';

  let kind = $state<number>(30023);
  let tags = $state<[string, string][]>([]);
  let content = $state('');
  let createdAt = $state<number>(Math.floor(Date.now() / 1000));
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let publishedRelays = $state<string[]>([]);

  let pubkey = $state<string | null>(null);
  let title = $state('');
  let dTag = $state('');
  let titleManuallyEdited = $state(false);
  let dTagManuallyEdited = $state(false);
  let dTagError = $state('');
  let lastPublishedEventId = $state<string | null>(null);
  $effect(() => {
    pubkey = get(activePubkey);
  });

  /**
   * Extracts the first Markdown/AsciiDoc header as the title.
   */
  function extractTitleFromContent(content: string): string {
    // Match Markdown (# Title) or AsciiDoc (= Title) headers
    const match = content.match(/^(#|=)\s*(.+)$/m);
    return match ? match[2].trim() : '';
  }

  function handleContentInput(e: Event) {
    content = (e.target as HTMLTextAreaElement).value;
    if (!titleManuallyEdited) {
      const extracted = extractTitleFromContent(content);
      title = extracted;
    }
  }

  function handleTitleInput(e: Event) {
    title = (e.target as HTMLInputElement).value;
    titleManuallyEdited = true;
  }

  function handleDTagInput(e: Event) {
    dTag = (e.target as HTMLInputElement).value;
    dTagManuallyEdited = true;
  }

  $effect(() => {
    if (!dTagManuallyEdited) {
      dTag = titleToDTag(title);
    }
  });

  function updateTag(index: number, key: string, value: string): void {
    tags = tags.map((t, i) => i === index ? [key, value] : t);
  }
  function addTag(): void {
    tags = [...tags, ['', '']];
  }
  function removeTag(index: number): void {
    tags = tags.filter((_, i) => i !== index);
  }

  function isValidKind(kind: number | string): boolean {
    const n = Number(kind);
    return Number.isInteger(n) && n >= 0 && n <= 65535;
  }

  function validate(): { valid: boolean; reason?: string } {
    if (!pubkey) return { valid: false, reason: 'Not logged in.' };
    if (!content.trim()) return { valid: false, reason: 'Content required.' };
    if (kind === 30023) {
      const v = validateNotAsciidoc(content);
      if (!v.valid) return v;
    }
    if (kind === 30040 || kind === 30041 || kind === 30818) {
      const v = validateAsciiDoc(content);
      if (!v.valid) return v;
    }
    return { valid: true };
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    dTagError = '';
    if (!dTag || dTag.trim() === '') {
      dTagError = 'A d-tag is required.';
      return;
    }
    handlePublish();
  }

  async function handlePublish(): Promise<void> {
    error = null;
    success = null;
    publishedRelays = [];
    loading = true;
    createdAt = Math.floor(Date.now() / 1000);
    
    try {
      const ndk = get(ndkInstance);
      if (!ndk || !pubkey) {
        error = 'NDK or pubkey missing.';
        loading = false;
        return;
      }
      
      if (!/^[a-fA-F0-9]{64}$/.test(pubkey)) {
        error = 'Invalid public key: must be a 64-character hex string.';
        loading = false;
        return;
      }

      // Validate before proceeding
      const validation = validate();
      if (!validation.valid) {
        error = validation.reason || 'Validation failed.';
        loading = false;
        return;
      }

      const baseEvent = { pubkey, created_at: createdAt };
      let events: NDKEvent[] = [];
      
      if (kind === 30040) {
        const { indexEvent, sectionEvents } = build30040EventSet(content, tags, baseEvent);
        events = [indexEvent, ...sectionEvents];
      } else {
        let eventTags = [...tags];
        
        // Ensure d-tag exists and has a value for addressable events
        if (requiresDTag(kind)) {
          const dTagIndex = eventTags.findIndex(([k]) => k === 'd');
          const existingDTag = dTagIndex >= 0 ? eventTags[dTagIndex][1] : '';
          const generatedDTag = getDTagForEvent(kind, content, existingDTag);
          
          if (generatedDTag) {
            if (dTagIndex >= 0) {
              // Update existing d-tag
              eventTags[dTagIndex] = ['d', generatedDTag];
            } else {
              // Add new d-tag
              eventTags = [...eventTags, ['d', generatedDTag]];
            }
          }
        }
        
        const title = getTitleTagForEvent(kind, content);
        if (title) {
          eventTags = [...eventTags, ['title', title]];
        }
        
        // Create event with proper serialization
        const eventData = {
          kind,
          content,
          tags: eventTags,
          pubkey,
          created_at: createdAt,
        };
        
        events = [new NDKEventClass(ndk, eventData)];
      }
      
      let atLeastOne = false;
      let relaysPublished: string[] = [];
      
      for (const event of events) {
        try {
          // Always sign with a plain object if window.nostr is available
          // Create a completely plain object to avoid proxy cloning issues
          const plainEvent = {
            kind: Number(event.kind),
            pubkey: String(event.pubkey),
            created_at: Number(event.created_at ?? Math.floor(Date.now() / 1000)),
            tags: event.tags.map(tag => [String(tag[0]), String(tag[1])]),
            content: String(event.content),
          };
          if (typeof window !== 'undefined' && window.nostr && window.nostr.signEvent) {
            const signed = await window.nostr.signEvent(plainEvent);
            event.sig = signed.sig;
            if ('id' in signed) {
              event.id = signed.id as string;
            }
          } else {
            await event.sign();
          }
          
          // Use direct WebSocket publishing like CommentBox does
          const signedEvent = {
            ...plainEvent,
            id: event.id,
            sig: event.sig,
          };
          
          // Try to publish to relays directly
          const relays = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol', ...standardRelays];
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
                      relaysPublished.push(relayUrl);
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
          
          if (published) {
            atLeastOne = true;
            lastPublishedEventId = event.id;
          }
        } catch (signError) {
          console.error('Error signing/publishing event:', signError);
          error = `Failed to sign event: ${signError instanceof Error ? signError.message : 'Unknown error'}`;
          loading = false;
          return;
        }
      }
      
      loading = false;
      if (atLeastOne) {
        publishedRelays = relaysPublished;
        success = `Published to ${relaysPublished.length} relay(s).`;
      } else {
        error = 'Failed to publish to any relay.';
      }
    } catch (err) {
      console.error('Error in handlePublish:', err);
      error = `Publishing failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      loading = false;
    }
  }
</script>

{#if pubkey}
  <div class='w-full max-w-2xl mx-auto my-8 p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg'>
    <h2 class='text-xl font-bold mb-4'>Publish Nostr Event</h2>
    <form class='space-y-4' onsubmit={handleSubmit}>
      <div>
        <label class='block font-medium mb-1' for='event-kind'>Kind</label>
        <input id='event-kind' type='text' class='input input-bordered w-full' bind:value={kind} required />
        {#if !isValidKind(kind)}
          <div class="text-red-600 text-sm mt-1">
            Kind must be an integer between 0 and 65535 (NIP-01).
          </div>
        {/if}
      </div>
      <div>
        <label class='block font-medium mb-1' for='tags-container'>Tags</label>
        <div id='tags-container' class='space-y-2'>
          {#each tags as [key, value], i}
            <div class='flex gap-2'>
              <input type='text' class='input input-bordered flex-1' placeholder='tag' bind:value={tags[i][0]} oninput={e => updateTag(i, (e.target as HTMLInputElement).value, tags[i][1])} />
              <input type='text' class='input input-bordered flex-1' placeholder='value' bind:value={tags[i][1]} oninput={e => updateTag(i, tags[i][0], (e.target as HTMLInputElement).value)} />
              <button type='button' class='btn btn-error btn-sm' onclick={() => removeTag(i)} disabled={tags.length === 1}>×</button>
            </div>
          {/each}
          <button type='button' class='btn btn-secondary btn-sm' onclick={addTag}>Add Tag</button>
        </div>
      </div>
      <div>
        <label class='block font-medium mb-1' for='event-content'>Content</label>
        <textarea
          id='event-content'
          bind:value={content}
          oninput={handleContentInput}
          placeholder='Content (start with a header for the title)'
          class='textarea textarea-bordered w-full h-40'
          required
        ></textarea>
      </div>
      <div>
        <label class='block font-medium mb-1' for='event-title'>Title</label>
        <input
          type='text'
          id='event-title'
          bind:value={title}
          oninput={handleTitleInput}
          placeholder='Title (auto-filled from header)'
          class='input input-bordered w-full'
        />
      </div>
      <div>
        <label class='block font-medium mb-1' for='event-d-tag'>d-tag</label>
        <input
          type='text'
          id='event-d-tag'
          bind:value={dTag}
          oninput={handleDTagInput}
          placeholder='d-tag (auto-generated from title)'
          class='input input-bordered w-full'
          required
        />
        {#if dTagError}
          <div class='text-red-600 text-sm mt-1'>{dTagError}</div>
        {/if}
      </div>
      <button type='submit' class='btn btn-primary' disabled={loading}>Publish</button>
      {#if loading}
        <span class='ml-2 text-gray-500'>Publishing...</span>
      {/if}
      {#if error}
        <div class='mt-2 text-red-600'>{error}</div>
      {/if}
      {#if success}
        <div class='mt-2 text-green-600'>{success}</div>
        <div class='text-xs text-gray-500'>Relays: {publishedRelays.join(', ')}</div>
        {#if lastPublishedEventId}
          <div class='mt-2 text-green-700'>
            Event ID: <span class='font-mono'>{lastPublishedEventId}</span>
            <a
              href={'/events?id=' + lastPublishedEventId}
              class='text-primary-600 dark:text-primary-500 hover:underline ml-2'
            >
              View your event
            </a>
          </div>
        {/if}
      {/if}
    </form>
  </div>
{/if} 