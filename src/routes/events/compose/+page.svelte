<script lang="ts">
  import { Heading, P, List, Li } from "flowbite-svelte";
  import EventInput from "$components/EventInput.svelte";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk.ts";
  import { userStore } from "$lib/stores/userStore.ts";
  import { AAlert } from "$lib/a";

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

      <P class="my-3">
        Use this page to compose and publish various types of events to the Nostr network.
        You can create notes, articles, and other event types depending on your needs.
      </P>

      <P class="mb-4">
        Create and publish new Nostr events to the network. This form
        supports various event kinds including:
      </P>

      <List
        class="mb-6 list-disc list-inside space-y-1"
      >
        <Li>
          <strong>Kind 30040:</strong> Publication indexes that organize AsciiDoc
          content into structured publications
        </Li>
        <Li>
          <strong>Kind 30041:</strong> Individual section content for publications
        </Li>
        <Li>
          <strong>Other kinds:</strong> Standard Nostr events with custom tags
          and content
        </Li>
      </List>

      {#if $userStore.signedIn}
        <EventInput />
      {:else}
        <AAlert color="blue">
          {#snippet title()}Sign In Required{/snippet}
          Please sign in to compose and publish events to the Nostr network.
        </AAlert>
      {/if}
    </div>
  </div>
</div>
