<script lang="ts">
  import { logout, ndkInstance, getActiveUser } from "$lib/ndk";
  import {
    ArrowRightToBracketOutline,
    UserOutline,
    ClipboardCleanOutline,
    CogOutline,
  } from "flowbite-svelte-icons";
  import { Avatar, Popover, Button } from "flowbite-svelte";
  import type { NostrProfile } from "$lib/utils/nostrUtils";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import SettingsModal from "$lib/components/SettingsModal.svelte";

  const externalProfileDestination = "./events?id=";

  let { pubkey } = $props();

  let profile = $state<NostrProfile | null>(null);
  let pfp = $derived.by(() => profile?.picture);
  let username = $derived.by(() => profile?.display_name || profile?.name);
  let nip05 = $derived.by(() => profile?.nip05);
  let npub = $derived.by(
    () => $ndkInstance.getUser({ pubkey: pubkey ?? undefined })?.npub,
  );
  let showSettings = $state(false);
  let copied = $state(false);
  let showNpubPopover = $state(false);

  $effect(() => {
    const user = $ndkInstance.getUser({ pubkey: pubkey ?? undefined });
    if (user?.npub) {
      getUserMetadata(user.npub).then((metadata) => {
        profile = metadata;
      });
    }
  });

  async function handleSignOutClick() {
    const user = getActiveUser();
    if (user) {
      logout(user);
    }
    profile = null;
    // Clear all Alexandria/Nostr-related localStorage/sessionStorage
    localStorage.clear(); // or selectively remove only Alexandria keys if you want
    sessionStorage.clear();
    // Force a full page reload
    location.reload();
  }

  function shortenNpub(long: string | undefined) {
    if (!long) return "";
    return long.slice(0, 8) + "…" + long.slice(-4);
  }

  function handleCopyNpub() {
    if (npub) {
      navigator.clipboard.writeText(npub);
      copied = true;
      setTimeout(() => (copied = false), 1000);
    }
  }
</script>

<div class="relative">
  {#if profile}
    <div class="group">
      <Avatar
        rounded
        class="h-6 w-6 cursor-pointer"
        src={pfp}
        alt={username}
        id="profile-avatar"
      />
      {#key username || nip05}
        <Popover
          placement="bottom"
          triggeredBy="#profile-avatar"
          class="popover-leather w-80"
          trigger="hover"
        >
          <div class="flex flex-col gap-1 text-left w-full">
            {#if username}
              <div class="font-bold text-lg text-primary-700 dark:text-primary-400 mb-2 w-full inline-block transition-colors hover:text-primary-400 dark:hover:text-primary-500">{username}</div>
              {#if nip05}
                <div class="text-base text-primary-700 dark:text-primary-400 mb-2 break-all w-full inline-block transition-colors hover:text-primary-400 dark:hover:text-primary-500 cursor-pointer">{nip05}</div>
              {/if}
            {/if}
            <div class="relative w-full mb-1">
              <Button
                color="none"
                class="flex items-center justify-start gap-2 px-2 py-2 rounded text-gray-900 font-medium w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100 break-all whitespace-normal"
                onclick={handleCopyNpub}
              >
                <ClipboardCleanOutline class="h-5 w-5 text-gray-500" />
                <span class="transition-colors hover:text-primary-400 dark:hover:text-primary-500">
                  {copied ? 'Copied!' : npub}
                </span>
              </Button>
            </div>
            <Button
              color="none"
              class="flex items-center justify-start gap-2 px-2 py-2 rounded text-gray-900 font-medium w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100"
              href={`${externalProfileDestination}${npub}`}
            >
              <UserOutline class="h-5 w-5 text-gray-500" />
              <span class="transition-colors hover:text-primary-400 dark:hover:text-primary-500">View profile</span>
            </Button>
            <Button
              color="none"
              class="flex items-center justify-start gap-2 px-2 py-2 rounded text-gray-900 font-medium w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100"
              onclick={() => (showSettings = true)}
            >
              <CogOutline class="h-5 w-5 text-gray-500" />
              <span class="transition-colors hover:text-primary-400 dark:hover:text-primary-500">Settings</span>
            </Button>
            <Button
              color="none"
              class="flex items-center justify-start gap-2 px-2 py-2 rounded text-gray-900 font-medium w-full text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100"
              onclick={handleSignOutClick}
            >
              <ArrowRightToBracketOutline class="h-5 w-5 text-gray-500" />
              <span class="transition-colors hover:text-primary-400 dark:hover:text-primary-500">Sign out</span>
            </Button>
          </div>
        </Popover>
      {/key}
    </div>
  {/if}
</div>

<SettingsModal show={showSettings} onClose={() => (showSettings = false)} />
