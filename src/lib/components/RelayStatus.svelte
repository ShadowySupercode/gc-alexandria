<script lang="ts">
  import { Button, Alert, Checkbox } from "flowbite-svelte";
  import {
    ndkSignedIn,
    testRelayConnection,
    checkWebSocketSupport,
    checkEnvironmentForWebSocketDowngrade,
  } from "$lib/ndk";
  import {  onMount } from "svelte";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext, updateActiveRelayStores } from "$lib/ndk";
  import { includeLocalhostRelays } from "$lib/stores/userStore";

  const ndk = getNdkContext();

  interface RelayStatus {
    url: string;
    connected: boolean;
    requiresAuth: boolean;
    error?: string;
    testing: boolean;
  }

  let relayStatuses = $state<RelayStatus[]>([]);
  let testing = $state(false);

  // Use the new relay management system
  let allRelays: string[] = $state([]);

  $effect(() => {
    allRelays = [...$activeInboxRelays, ...$activeOutboxRelays];
  });

  async function runRelayTests() {
    testing = true;
    if (!ndk) {
      testing = false;
      return;
    }

    let relaysToTest: string[] = [];

    // Use active relays from the new relay management system
    const userRelays = new Set([...$activeInboxRelays, ...$activeOutboxRelays]);
    relaysToTest = Array.from(userRelays);

    console.log("[RelayStatus] Relays to test:", relaysToTest);

    relayStatuses = relaysToTest.map((url) => ({
      url,
      connected: false,
      requiresAuth: false,
      testing: true,
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
    if (status.requiresAuth && !$ndkSignedIn) return "text-orange-600";
    return "text-red-600";
  }

  function getStatusText(status: RelayStatus): string {
    if (status.testing) return "Testing...";
    if (status.connected) return "Connected";
    if (status.requiresAuth && !$ndkSignedIn) return "Requires Authentication";
    if (status.error) return `Error: ${status.error}`;
    return "Failed to Connect";
  }

  // AI-NOTE: 2025-01-24 - Handle localhost relay preference change
  async function handleLocalhostToggle() {
    // Update relay stores to reflect the new preference
    try {
      await updateActiveRelayStores(ndk, true); // Force update
    } catch (error) {
      console.warn("Failed to update relay stores after localhost preference change:", error);
    }
    
    // Re-run relay tests when the preference changes
    void runRelayTests();
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-medium">Relay Connection Status</h3>
    <Button size="sm" onclick={runRelayTests} disabled={testing}>
      {testing ? "Testing..." : "Refresh"}
    </Button>
  </div>

  <div class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded">
    <Checkbox 
      id="localhost-relays-checkbox"
      bind:checked={$includeLocalhostRelays}
      onchange={handleLocalhostToggle}
    />
    <label for="localhost-relays-checkbox" class="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
      Include localhost relays (for development/testing)
    </label>
  </div>

  {#if !$ndkSignedIn}
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
      <div class="flex items-center justify-between p-3">
        <div class="flex-1">
          <div class="font-medium">{status.url}</div>
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

  {#if relayStatuses.some((s) => s.requiresAuth && !$ndkSignedIn)}
    <Alert color="orange">
      <span class="font-medium">Authentication Required</span>
      <p class="mt-1 text-sm">
        Some relays require authentication. Sign in to access these relays.
      </p>
    </Alert>
  {/if}
</div>
