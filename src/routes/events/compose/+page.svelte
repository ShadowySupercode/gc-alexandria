<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import EventInput from "$components/EventInput.svelte";
  import { userPubkey, isLoggedIn } from "$lib/stores/authStore.Svelte.js";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk.ts";

  // AI-NOTE: 2025-01-24 - Reactive effect to log relay configuration when stores change - non-blocking approach
  $effect.pre(() => {
    const inboxRelays = $activeInboxRelays;
    const outboxRelays = $activeOutboxRelays;

    // Only log if we have relays (not empty arrays)
    if (inboxRelays.length > 0 || outboxRelays.length > 0) {
      // Defer logging to avoid blocking the reactive system
      requestAnimationFrame(() => {
        console.log('🔌 Compose Page - Relay Configuration Updated:');
        console.log('📥 Inbox Relays:', inboxRelays);
        console.log('📤 Outbox Relays:', outboxRelays);
        console.log(`📊 Total: ${inboxRelays.length} inbox, ${outboxRelays.length} outbox`);
      });
    }
  });
</script>

<div class="w-full flex justify-center">
  <div class="flex flex-col w-full max-w-4xl my-6 px-4 mx-auto">
    <div class="main-leather flex flex-col space-y-6">
      <Heading tag="h1" class="h-leather mb-2">Compose Event</Heading>

      <P class="mb-3">
        Use this page to compose and publish various types of events to the Nostr network.
        You can create notes, articles, and other event types depending on your needs.
      </P>

      {#if isLoggedIn && userPubkey}
        <EventInput />
      {:else}
        <div class="p-6 bg-gray-200 dark:bg-gray-700 rounded-lg text-center">
          <Heading tag="h3" class="h-leather mb-4">Sign In Required</Heading>
          <P>Please sign in to compose and publish events to the Nostr network.</P>
        </div>
      {/if}
    </div>
  </div>
</div>
