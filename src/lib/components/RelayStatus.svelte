<script lang="ts">
  import { Button, Alert, Heading } from "flowbite-svelte";
  import {
    ndkSignedIn,
    testRelayConnection,
    checkWebSocketSupport,
    checkEnvironmentForWebSocketDowngrade,
  } from "$lib/ndk";
  import {  onMount } from "svelte";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";
  import { AAlert } from '$lib/a/index.ts';

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
</script>

<div class="space-y-4 w-full max-w-3xl flex self-center">
  <div class="flex items-center justify-between">
    <Heading tag="h1">Relay Connection Status</Heading>
    <Button size="sm" onclick={runRelayTests} disabled={testing}>
      {testing ? "Testing..." : "Refresh"}
    </Button>
  </div>

  {#if !$ndkSignedIn}
    <AAlert color="yellow">
      <span class="font-medium">Anonymous Mode</span>
      <p class="mt-1 text-sm">
        You are not signed in. Some relays require authentication and may not be
        accessible. Sign in to access all relays.
      </p>
    </AAlert>
  {/if}

  <div class="flex flex-col space-y-2">
    {#each relayStatuses as status}
      <div class="flex flex-row items-center justify-between p-3">
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
    <AAlert color="orange">
      <span class="font-medium">Authentication Required</span>
      <p class="mt-1 text-sm">
        Some relays require authentication. Sign in to access these relays.
      </p>
    </AAlert>
  {/if}
</div>
