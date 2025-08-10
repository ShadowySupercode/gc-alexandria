<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchRelayInfo, getRelayTypeLabel, getRelayIcon, type RelayInfoWithMetadata } from '$lib/utils/relay_info_service';

  const { relay, showIcon = true, showType = true, showName = true, size = 'sm' } = $props<{
    relay: string;
    showIcon?: boolean;
    showType?: boolean;
    showName?: boolean;
    size?: 'xs' | 'sm' | 'md' | 'lg';
  }>();

  let relayInfo = $state<RelayInfoWithMetadata | undefined>(undefined);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  // Size classes
  const sizeClasses: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const iconSizeClasses: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  async function loadRelayInfo() {
    isLoading = true;
    error = null;
    
    try {
      relayInfo = await fetchRelayInfo(relay);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load relay info';
      console.warn(`[RelayInfoDisplay] Error loading info for ${relay}:`, err);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadRelayInfo();
  });

  // Get relay type and label
  const relayType = $derived(getRelayTypeLabel(relay, relayInfo));
  const relayIcon = $derived(getRelayIcon(relayInfo, relay));
  const displayName = $derived(relayInfo?.name || relayInfo?.shortUrl || relay);
</script>

<div class="inline-flex items-center gap-2 flex-1">
  {#if showIcon && relayIcon}
    <img 
      src={relayIcon} 
      alt="Relay icon" 
      class="{iconSizeClasses[size as keyof typeof iconSizeClasses]} rounded object-contain"
      onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
    />
  {:else if showIcon}
    <!-- Fallback icon -->
    <div class="{iconSizeClasses[size as keyof typeof iconSizeClasses]} bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center">
      <svg class="w-2/3 h-2/3 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V4z" clip-rule="evenodd" />
      </svg>
    </div>
  {/if}

  <div class="flex flex-col min-w-0 flex-1">
    {#if showName}
      <span class="{sizeClasses[size as keyof typeof sizeClasses]} font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">
        {isLoading ? 'Loading...' : displayName}
      </span>
    {/if}
    
    {#if showType}
      <span class="text-xs text-gray-500 dark:text-gray-400 leading-tight truncate">
        {relayType}
      </span>
    {/if}
  </div>

  {#if error}
    <span class="text-xs text-red-500 dark:text-red-400 flex-shrink-0" title={error}>
      ⚠️
    </span>
  {/if}
</div>
