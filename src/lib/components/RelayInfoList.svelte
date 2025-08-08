<script lang="ts">
  import RelayInfoDisplay from './RelayInfoDisplay.svelte';
  import { fetchRelayInfos, type RelayInfoWithMetadata } from '$lib/utils/relay_info_service';

  const { 
    relays, 
    inboxRelays = [], 
    outboxRelays = [], 
    showLabels = true,
    compact = false 
  } = $props<{
    relays: string[];
    inboxRelays?: string[];
    outboxRelays?: string[];
    showLabels?: boolean;
    compact?: boolean;
  }>();

  let relayInfos = $state<RelayInfoWithMetadata[]>([]);
  let isLoading = $state(true);

  type CategorizedRelay = {
    relay: string;
    category: 'both' | 'inbox' | 'outbox' | 'other';
    label: string;
  };

  // AI-NOTE: Updated to show only top-3 inboxes and top-3 outboxes as intended
  const categorizedRelays = $derived(() => {
    const inbox = new Set(inboxRelays);
    const outbox = new Set(outboxRelays);
    
    console.log('[RelayInfoList] Categorizing relays:', { 
      relays: relays.length, 
      inboxRelays: inboxRelays.length, 
      outboxRelays: outboxRelays.length
    });
    
    // Create a map of all relays with their categories
    const relayCategories = new Map<string, CategorizedRelay>();
    
    // Process inbox relays (up to top 3)
    const topInboxRelays = inboxRelays.slice(0, 3);
    topInboxRelays.forEach((relay: string) => {
      const isOutbox = outbox.has(relay);
      if (isOutbox) {
        relayCategories.set(relay, { relay, category: 'both', label: 'Inbox & Outbox' });
      } else {
        relayCategories.set(relay, { relay, category: 'inbox', label: 'Recipient Inbox' });
      }
    });
    
    // Process outbox relays (up to top 3)
    const topOutboxRelays = outboxRelays.slice(0, 3);
    topOutboxRelays.forEach((relay: string) => {
      if (!relayCategories.has(relay)) {
        relayCategories.set(relay, { relay, category: 'outbox', label: 'Sender Outbox' });
      }
    });
    
    // Only include relays that are actually in the top-3 lists
    // This ensures we only show the intended top-3 inboxes and top-3 outboxes
    const categorized = Array.from(relayCategories.values());
    console.log('[RelayInfoList] Categorized relays count:', categorized.length);
    return categorized;
  });

  // Group by category
  const groupedRelays = $derived(() => {
    const categorized = categorizedRelays();
    console.log('[RelayInfoList] Grouping categorized relays');
    
    const groups = {
      both: categorized.filter((r: CategorizedRelay) => r.category === 'both'),
      inbox: categorized.filter((r: CategorizedRelay) => r.category === 'inbox'),
      outbox: categorized.filter((r: CategorizedRelay) => r.category === 'outbox'),
      other: categorized.filter((r: CategorizedRelay) => r.category === 'other')
    };
    
    console.log('[RelayInfoList] Grouped relays:', Object.fromEntries(
      Object.entries(groups).map(([key, relays]) => [key, relays.length])
    ));
    return groups;
  });

  async function loadRelayInfos() {
    isLoading = true;
    try {
      const categorized = categorizedRelays();
      const relayUrls = categorized.map(r => r.relay);
      relayInfos = await fetchRelayInfos(relayUrls);
    } catch (error) {
      console.warn('[RelayInfoList] Error loading relay infos:', error);
    } finally {
      isLoading = false;
    }
  }

  // Load relay info when categorized relays change
  $effect(() => {
    const categorized = categorizedRelays();
    console.log('[RelayInfoList] Categorized relays changed:', { 
      total: categorized.length,
      byCategory: Object.fromEntries(
        Object.entries(groupedRelays()).map(([key, relays]) => [key, relays.length])
      )
    });
    if (categorized.length > 0) {
      loadRelayInfos();
    }
  });

  // Get relay info for a specific relay
  function getRelayInfo(relayUrl: string): RelayInfoWithMetadata | undefined {
    return relayInfos.find(info => info.url === relayUrl);
  }

  // Category colors
  const categoryColors = {
    both: 'bg-green-100 dark:bg-green-900 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200',
    inbox: 'bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200',
    outbox: 'bg-purple-100 dark:bg-purple-900 border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-200',
    other: 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
  };

  const categoryIcons = {
    both: '🔄',
    inbox: '📥',
    outbox: '📤',
    other: '🌐'
  };
</script>

<div class="space-y-2">
  {#if showLabels && !compact}
    {@const categorizedCount = categorizedRelays().length}
    {@const debugCategorized = console.log('[RelayInfoList] Debug - categorized relays:', categorizedRelays())}
    <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
      Publishing to {categorizedCount} relay(s):
    </div>
  {/if}

  {#if isLoading}
    <div class="flex items-center justify-center py-2">
      <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
      <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading relay info...</span>
    </div>
  {:else}
    {@const categorized = categorizedRelays()}
    {@const debugCategorized = console.log('[RelayInfoList] Debug - categorized relays:', categorized)}
    
    <div class="space-y-1">
      {#each categorized as { relay, category, label }}
        <div class="p-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <span class="text-sm font-mono text-gray-900 dark:text-gray-100">
              {relay}
            </span>
            {#if category === 'both'}
              <span class="text-xs text-gray-500 dark:text-gray-400 italic">
                common relay
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
