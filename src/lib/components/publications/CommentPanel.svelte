<script lang="ts">
  import type { NDKEvent } from "@nostr-dev-kit/ndk";
  import { getUserMetadata, toNpub } from "$lib/utils/nostrUtils";
  import { getNdkContext } from "$lib/ndk";
  import { basicMarkup } from "$lib/snippets/MarkupSnippets.svelte";
  import { ChevronDownOutline, ChevronRightOutline } from "flowbite-svelte-icons";

  let {
    comments = [],
    sectionTitles = new Map<string, string>(),
  }: {
    comments: NDKEvent[];
    sectionTitles?: Map<string, string>;
  } = $props();

  const ndk = getNdkContext();

  // State management
  let profiles = $state(new Map<string, any>());
  let expandedSections = $state(new Set<string>());

  /**
   * Group comments by their target event address
   * Extracts the target from #a or #e tags
   */
  let groupedComments = $derived.by(() => {
    const groups = new Map<string, NDKEvent[]>();

    for (const comment of comments) {
      // Look for #a tag first (addressable events - preferred)
      const aTag = comment.tags.find(t => t[0] === "a");
      if (aTag && aTag[1]) {
        const address = aTag[1];
        if (!groups.has(address)) {
          groups.set(address, []);
        }
        groups.get(address)!.push(comment);
        continue;
      }

      // Fallback to #e tag (event ID)
      const eTag = comment.tags.find(t => t[0] === "e");
      if (eTag && eTag[1]) {
        const eventId = eTag[1];
        if (!groups.has(eventId)) {
          groups.set(eventId, []);
        }
        groups.get(eventId)!.push(comment);
      }
    }

    console.log(`[CommentPanel] Grouped ${comments.length} comments into ${groups.size} sections`);
    return groups;
  });

  /**
   * Get a display label for a target address/id
   * Uses provided section titles, or falls back to address/id
   */
  function getTargetLabel(target: string): string {
    // Check if we have a title for this address
    if (sectionTitles.has(target)) {
      return sectionTitles.get(target)!;
    }

    // Parse address format: kind:pubkey:d-tag
    const parts = target.split(":");
    if (parts.length === 3) {
      const [kind, _pubkey, dTag] = parts;
      if (kind === "30040") {
        return "Comments on Collection";
      }
      if (kind === "30041" && dTag) {
        return `Section: ${dTag}`;
      }
    }

    // Fallback to truncated address/id
    return target.length > 20 ? `${target.substring(0, 20)}...` : target;
  }

  /**
   * Fetch profile for a pubkey
   */
  async function fetchProfile(pubkey: string) {
    if (profiles.has(pubkey)) return;

    try {
      const npub = toNpub(pubkey);
      if (!npub) {
        setFallbackProfile(pubkey);
        return;
      }

      const profile = await getUserMetadata(npub, ndk, true);
      const newProfiles = new Map(profiles);
      newProfiles.set(pubkey, profile);
      profiles = newProfiles;

      console.log(`[CommentPanel] Fetched profile for ${pubkey}:`, profile);
    } catch (err) {
      console.warn(`[CommentPanel] Failed to fetch profile for ${pubkey}:`, err);
      setFallbackProfile(pubkey);
    }
  }

  /**
   * Set fallback profile using truncated npub
   */
  function setFallbackProfile(pubkey: string) {
    const npub = toNpub(pubkey) || pubkey;
    const truncated = `${npub.slice(0, 12)}...${npub.slice(-4)}`;
    const fallbackProfile = {
      name: truncated,
      displayName: truncated,
      picture: null
    };
    const newProfiles = new Map(profiles);
    newProfiles.set(pubkey, fallbackProfile);
    profiles = newProfiles;
  }

  /**
   * Get display name for a pubkey
   */
  function getDisplayName(pubkey: string): string {
    const profile = profiles.get(pubkey);
    if (profile) {
      return profile.displayName || profile.name || profile.pubkey || pubkey;
    }
    // Return truncated npub while loading
    const npub = toNpub(pubkey) || pubkey;
    return `${npub.slice(0, 12)}...${npub.slice(-4)}`;
  }

  /**
   * Toggle section expansion
   */
  function toggleSection(target: string) {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(target)) {
      newExpanded.delete(target);
    } else {
      newExpanded.add(target);
    }
    expandedSections = newExpanded;
  }

  /**
   * Format timestamp
   */
  function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Pre-fetch all profiles when comments change
   */
  $effect(() => {
    const uniquePubkeys = new Set(comments.map(c => c.pubkey));
    console.log(`[CommentPanel] Pre-fetching ${uniquePubkeys.size} profiles`);
    for (const pubkey of uniquePubkeys) {
      fetchProfile(pubkey);
    }
  });
</script>

{#if comments.length > 0}
  <div class="fixed right-4 top-20 bottom-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden flex flex-col z-40">
    <!-- Header -->
    <div class="p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Comments ({comments.length})
      </h3>
    </div>

    <!-- Comment groups -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      {#each Array.from(groupedComments.entries()) as [target, targetComments]}
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <!-- Section header -->
          <button
            class="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onclick={() => toggleSection(target)}
          >
            <div class="flex items-center gap-2">
              {#if expandedSections.has(target)}
                <ChevronDownOutline class="w-4 h-4 text-gray-600 dark:text-gray-400" />
              {:else}
                <ChevronRightOutline class="w-4 h-4 text-gray-600 dark:text-gray-400" />
              {/if}
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                {getTargetLabel(target)}
              </span>
            </div>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {targetComments.length} {targetComments.length === 1 ? 'comment' : 'comments'}
            </span>
          </button>

          <!-- Comment list -->
          {#if expandedSections.has(target)}
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each targetComments as comment (comment.id)}
                <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <!-- Comment header -->
                  <div class="flex items-start gap-3 mb-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline gap-2">
                        <span class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {getDisplayName(comment.pubkey)}
                        </span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {formatTimestamp(comment.created_at || 0)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Comment content -->
                  <div class="text-sm text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none">
                    {@render basicMarkup(comment.content)}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      {#if groupedComments.size === 0 && comments.length > 0}
        <div class="text-center py-8">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Comments loaded but couldn't determine their targets
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Custom scrollbar for comment panel */
  .overflow-y-auto {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }

  .overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }

  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }
</style>
