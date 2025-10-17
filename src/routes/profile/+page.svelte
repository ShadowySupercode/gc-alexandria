<script lang="ts">
  import { AAlert, AProfilePreview, AThemeToggleMini } from "$lib/a";
  import CommentBox from "$lib/components/CommentBox.svelte";
  import CommentViewer from "$lib/components/CommentViewer.svelte";
  import { type UserState, userStore } from "$lib/stores/userStore";
  import { Heading } from "flowbite-svelte";
  import ATechToggle from "$lib/a/reader/ATechToggle.svelte";
  import { unifiedProfileCache } from "$lib/utils/npubCache.ts";
  import type { NDKEvent } from "@nostr-dev-kit/ndk";

  const user: UserState | undefined = $derived($userStore);
  let profileEvent: NDKEvent | undefined = $state(undefined);

  $effect(() => {
    if (user && user.signedIn && user.npub) {
      profileEvent = unifiedProfileCache.getCachedEvent(user.npub);
    }
  })

  let userRelayPreference = $state(false); // required by CommentBox
  let isOwn = $derived.by(() => {
    return !!user?.signedIn && (!profileEvent?.pubkey || profileEvent.pubkey === user.pubkey);
  });

  let userLite=$derived.by(() => {
    return {
      npub: user?.npub,
    };
  });
</script>

{#if user && user.signedIn}
  <div class="w-full flex justify-center">
    <div class="flex flex-col w-full max-w-5xl my-6 px-4 mx-auto gap-6">
      {#if user && user.profile && profileEvent}
        <AProfilePreview event={profileEvent} user={userLite} profile={user.profile} {isOwn} />
      {/if}
      <div class="mt-6">
        <Heading tag="h3" class="h-leather mb-4">
          Settings
        </Heading>
        <!-- Theme and tech settings -->
        <ul>
          <li>
            <ATechToggle />
          </li>
          <li>
            <AThemeToggleMini />
          </li>
        </ul>
      </div>

      {#if user && profileEvent}
        <div class="main-leather flex flex-col space-y-6">
          <CommentViewer event={profileEvent} />
          <CommentBox event={profileEvent} {userRelayPreference} />
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="w-full max-w-3xl mx-auto mt-10 px-4">
    <AAlert color="blue">Please log in to view your profile.</AAlert>
  </div>
{/if}
