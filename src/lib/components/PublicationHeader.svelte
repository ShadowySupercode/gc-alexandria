<script lang="ts">
  import { ndkInstance } from "$lib/ndk";
  import { naddrEncode } from "$lib/utils";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { standardRelays } from "../consts";
  import { Card, Img } from "flowbite-svelte";
  import CardActions from "$components/util/CardActions.svelte";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { goto } from '$app/navigation';
  import { getUserMetadata, toNpub, getMatchingTags } from "$lib/utils/nostrUtils";

  const { event } = $props<{ event: NDKEvent }>();

  const relays = $derived.by(() => {
    return $ndkInstance.activeUser?.relayUrls ?? standardRelays;
  });

  const href = $derived.by(() => {
    const d = event.getMatchingTags("d")[0]?.[1];
    if (d != null) {
      return `publication?d=${d}`;
    } else {
      return `publication?id=${naddrEncode(event, relays)}`;
    }
  });

  let title: string = $derived(event.getMatchingTags('title')[0]?.[1]);
  let authorTag: string = $derived(event.getMatchingTags('author')[0]?.[1] ?? '');
  let pTag: string = $derived(event.getMatchingTags('p')[0]?.[1] ?? '');
  let version: string = $derived(event.getMatchingTags('version')[0]?.[1] ?? '1');
  let image: string = $derived(event.getMatchingTags('image')[0]?.[1] ?? null);
  let authorPubkey: string = $derived(
    event.getMatchingTags("p")[0]?.[1] ?? null,
  );
  let hashtags: string[] = $derived(event.getMatchingTags('t').map((tag: string[]) => tag[1]));

  // New: fetch profile display name for authorPubkey
  let authorDisplayName = $state<string | undefined>(undefined);
  let imageLoaded = $state(false);
  let imageError = $state(false);

  function isValidNostrPubkey(str: string): boolean {
    return /^[a-f0-9]{64}$/i.test(str) || (str.startsWith('npub1') && str.length >= 59 && str.length <= 63);
  }

  function navigateToHashtagSearch(tag: string): void {
    const encoded = encodeURIComponent(tag);
    goto(`/events?t=${encoded}`, {
      replaceState: false,
      keepFocus: true,
      noScroll: true,
    });
  }

  function generatePastelColor(eventId: string): string {
    // Use the first 6 characters of the event ID to generate a pastel color
    const hash = eventId.substring(0, 6);
    const r = parseInt(hash.substring(0, 2), 16);
    const g = parseInt(hash.substring(2, 4), 16);
    const b = parseInt(hash.substring(4, 6), 16);
    
    // Convert to pastel by mixing with white (lightening the color)
    const pastelR = Math.round((r + 255) / 2);
    const pastelG = Math.round((g + 255) / 2);
    const pastelB = Math.round((b + 255) / 2);
    
    return `rgb(${pastelR}, ${pastelG}, ${pastelB})`;
  }

  function handleImageLoad() {
    imageLoaded = true;
  }

  function handleImageError() {
    imageError = true;
  }

  $effect(() => {
    if (authorPubkey) {
      getUserMetadata(toNpub(authorPubkey) as string).then((profile) => {
        authorDisplayName =
          profile.displayName ||
          (profile as any).display_name ||
          authorTag ||
          authorPubkey;
      });
    } else {
      authorDisplayName = undefined;
    }
  });
</script>

{#if title != null && href != null}
  <Card
    class="ArticleBox card-leather max-w-md h-64 flex flex-row overflow-hidden"
  >
    <div class="w-24 h-full overflow-hidden flex-shrink-0">
      {#if image && !imageError}
        <div class="w-full h-full relative">
          <!-- Pastel placeholder -->
          <div 
            class="w-full h-full transition-opacity duration-300"
            style="background-color: {generatePastelColor(event.id)}; opacity: {imageLoaded ? '0' : '1'}"
          ></div>
          <!-- Image -->
          <img 
            src={image} 
            class="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
            style="opacity: {imageLoaded ? '1' : '0'}"
            onload={handleImageLoad}
            onerror={handleImageError}
            loading="lazy"
            alt="Publication cover"
          />
        </div>
      {:else}
        <!-- Pastel placeholder when no image or image failed to load -->
        <div 
          class="w-full h-full"
          style="background-color: {generatePastelColor(event.id)}"
        ></div>
      {/if}
    </div>
    <div class="flex flex-col flex-grow p-4 relative">
      <div class="absolute top-2 right-2 z-10">
        <CardActions {event} />
      </div>
      <button
        class="flex flex-col space-y-2 text-left w-full bg-transparent border-none p-0 hover:underline pr-8"
        onclick={() => goto(`/${href}`)}
      >
        <h2 class='text-lg font-bold line-clamp-2' title="{title}">{title}</h2>
        <h3 class='text-base font-normal'>
          by
          {#if authorTag && pTag && isValidNostrPubkey(pTag)}
            {authorTag} {@render userBadge(pTag, '')}
          {:else if authorTag}
            {authorTag}
          {:else if pTag && isValidNostrPubkey(pTag)}
            {@render userBadge(pTag, '')}
          {:else if authorPubkey != null}
            {@render userBadge(authorPubkey, authorDisplayName)}
          {:else}
            unknown
          {/if}
        </h3>
        {#if version != "1"}
          <h3
            class="text-base font-medium text-primary-700 dark:text-primary-300"
          >
            version: {version}
          </h3>
        {/if}
      </button>
      {#if hashtags.length > 0}
        <div class="tags mt-auto pt-2 flex flex-wrap gap-1">
          {#each hashtags as tag (tag)}
            <button
              class="text-xs text-primary-600 dark:text-primary-500 hover:text-primary-800 dark:hover:text-primary-300 hover:underline cursor-pointer"
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                navigateToHashtagSearch(tag);
              }}
            >
              #{tag}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </Card>
{/if}
