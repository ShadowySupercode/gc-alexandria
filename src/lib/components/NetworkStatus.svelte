<script lang="ts">
  import { networkCondition, isNetworkChecking, startNetworkStatusMonitoring } from '$lib/stores/networkStore';
  import { NetworkCondition } from '$lib/utils/network_detection';
  import { onMount } from 'svelte';

  function getStatusColor(): string {
    switch ($networkCondition) {
      case NetworkCondition.ONLINE:
        return 'text-green-600 dark:text-green-400';
      case NetworkCondition.SLOW:
        return 'text-yellow-600 dark:text-yellow-400';
      case NetworkCondition.OFFLINE:
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  }

  function getStatusIcon(): string {
    switch ($networkCondition) {
      case NetworkCondition.ONLINE:
        return '🟢';
      case NetworkCondition.SLOW:
        return '🟡';
      case NetworkCondition.OFFLINE:
        return '🔴';
      default:
        return '⚪';
    }
  }

  function getStatusText(): string {
    switch ($networkCondition) {
      case NetworkCondition.ONLINE:
        return 'Online';
      case NetworkCondition.SLOW:
        return 'Slow Connection';
      case NetworkCondition.OFFLINE:
        return 'Offline';
      default:
        return 'Unknown';
    }
  }

  onMount(() => {
    // Start centralized network monitoring
    startNetworkStatusMonitoring();
  });
</script>

<div class="flex items-center space-x-2 text-xs {getStatusColor()} font-medium">
  {#if $isNetworkChecking}
    <span class="animate-spin">⏳</span>
    <span>Checking...</span>
  {:else}
    <span class="text-lg">{getStatusIcon()}</span>
    <span>{getStatusText()}</span>
  {/if}
</div> 