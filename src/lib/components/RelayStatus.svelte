<script lang="ts">
  import { Button, Alert } from "flowbite-svelte";
  import {
    ndkInstance,
    testRelayConnection,
    checkWebSocketSupport,
    checkEnvironmentForWebSocketDowngrade,
  } from "$lib/ndk";
  import { onMount } from "svelte";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { userStore } from "$lib/stores/userStore";
  import { 
    communityRelays, 
    searchRelays, 
    secondaryRelays, 
    anonymousRelays, 
    lowbandwidthRelays,
    localRelays
  } from "$lib/consts";

  interface RelayStatus {
    url: string;
    connected: boolean;
    requiresAuth: boolean;
    error?: string;
    testing: boolean;
    category: string;
  }

  let relayStatuses = $state<RelayStatus[]>([]);
  let testing = $state(false);

  // Use the new relay management system
  let allRelays: string[] = $state([]);
  let userState = $derived($userStore);

  // Debug authentication state
  $effect(() => {
    console.log("[RelayStatus] User state changed:", {
      signedIn: userState.signedIn,
      pubkey: userState.pubkey,
      npub: userState.npub,
      loginMethod: userState.loginMethod
    });
  });

  // Get all configured relays that could be used by the application
  function getAllConfiguredRelays(): string[] {
    const allConfiguredRelays = [
      ...communityRelays,
      ...searchRelays,
      ...secondaryRelays,
      ...anonymousRelays,
      ...lowbandwidthRelays,
      ...localRelays,
      ...$activeInboxRelays,
      ...$activeOutboxRelays
    ];
    
    // Remove duplicates while preserving order
    const uniqueRelays = [];
    const seen = new Set();
    for (const relay of allConfiguredRelays) {
      if (!seen.has(relay)) {
        seen.add(relay);
        uniqueRelays.push(relay);
      }
    }
    
    return uniqueRelays;
  }

  $effect(() => {
    allRelays = getAllConfiguredRelays();
  });

  async function runRelayTests() {
    testing = true;
    const ndk = $ndkInstance;
    if (!ndk) {
      testing = false;
      return;
    }

    const relaysToTest = getAllConfiguredRelays();
    console.log("[RelayStatus] Testing all configured relays:", relaysToTest);

    relayStatuses = relaysToTest.map((url) => ({
      url,
      connected: false,
      requiresAuth: false,
      testing: true,
      category: getRelayCategory(url),
    }));

    const results = await Promise.allSettled(
      relaysToTest.map(async (url) => {
        console.log("[RelayStatus] Testing relay:", url);
        try {
          return await testRelayConnection(url, ndk);
        } catch (error) {
          return {
            connected: false,
            requiresAuth: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      }),
    );

    relayStatuses = relayStatuses.map((status, index) => {
      const result = results[index];
      if (result.status === "fulfilled") {
        return {
          ...status,
          ...result.value,
          testing: false,
        };
      } else {
        return {
          ...status,
          connected: false,
          requiresAuth: false,
          error: "Test failed",
          testing: false,
        };
      }
    });

    testing = false;
  }

  function getRelayCategory(url: string): string {
    if (communityRelays.includes(url)) return "Community";
    if (searchRelays.includes(url)) return "Search";
    if (secondaryRelays.includes(url)) return "Secondary";
    if (anonymousRelays.includes(url)) return "Anonymous";
    if (lowbandwidthRelays.includes(url)) return "Low Bandwidth";
    if (localRelays.includes(url)) return "Local";
    if ($activeInboxRelays.includes(url)) return "Active Inbox";
    if ($activeOutboxRelays.includes(url)) return "Active Outbox";
    return "Other";
  }

  $effect(() => {
    // Re-run relay tests when feed type, login state, or relay lists change
    void runRelayTests();
  });

  onMount(() => {
    checkWebSocketSupport();
    checkEnvironmentForWebSocketDowngrade();
    // Run initial relay tests
    void runRelayTests();
  });

  function getStatusColor(status: RelayStatus): string {
    if (status.testing) return "text-yellow-600";
    if (status.connected) return "text-green-600";
    if (status.requiresAuth && !userState.signedIn) return "text-orange-600";
    return "text-red-600";
  }

  function getStatusText(status: RelayStatus): string {
    if (status.testing) return "Testing...";
    if (status.connected) return "Connected";
    if (status.requiresAuth && !userState.signedIn) return "Requires Authentication";
    if (status.error) return `Error: ${status.error}`;
    return "Failed to Connect";
  }

  function getCategoryColor(category: string): string {
    switch (category) {
      case "Community": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "Search": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "Secondary": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "Anonymous": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
      case "Low Bandwidth": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "Local": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "Active Inbox": return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300";
      case "Active Outbox": return "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-medium">Relay Connection Status</h3>
    <Button size="sm" onclick={runRelayTests} disabled={testing}>
      {testing ? "Testing..." : "Refresh"}
    </Button>
  </div>

  {#if !userState.signedIn}
    <Alert color="yellow">
      <span class="font-medium">Anonymous Mode</span>
      <p class="mt-1 text-sm">
        You are not signed in. Some relays require authentication and may not be
        accessible. Sign in to access all relays.
      </p>
    </Alert>
  {/if}

  <div class="space-y-2">
    {#each relayStatuses as status}
      <div class="flex items-center justify-between p-3 border rounded-lg">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <div class="font-medium">{status.url}</div>
            <span class="text-xs px-2 py-1 rounded {getCategoryColor(status.category)}">
              {status.category}
            </span>
          </div>
          <div class="text-sm {getStatusColor(status)}">
            {getStatusText(status)}
          </div>
        </div>
        <div
          class="w-3 h-3 rounded-full {getStatusColor(status).replace(
            'text-',
            'bg-',
          )}"
        ></div>
      </div>
    {/each}
  </div>

  {#if relayStatuses.some((s) => s.requiresAuth && !userState.signedIn)}
    <Alert color="orange">
      <span class="font-medium">Authentication Required</span>
      <p class="mt-1 text-sm">
        Some relays require authentication. Sign in to access these relays.
      </p>
    </Alert>
  {/if}
</div>
