<script lang="ts">
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import NetworkStatus from "$components/NetworkStatus.svelte";
  import { logoutUser, userStore } from "$lib/stores/userStore";
  import { ndkInstance } from "$lib/ndk";
  import {
    ArrowRightToBracketOutline,
    UserOutline,
    FileSearchOutline,
  } from "flowbite-svelte-icons";
  import { Avatar, Popover } from "flowbite-svelte";
  import type { NDKUserProfile } from "@nostr-dev-kit/ndk";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";

  let { pubkey, isNav = false } = $props();

  // Use profile data from userStore instead of fetching separately
  let userState = $derived($userStore);
  let profile = $derived(userState.profile);
  let pfp = $derived(profile?.picture);
  let username = $derived(profile?.name);
  let tag = $derived(profile?.name);
  let npub = $derived(userState.npub);

  // Fallback to fetching profile if not available in userStore
  $effect(() => {
    if (!profile && pubkey) {
      const ndk = get(ndkInstance);
      if (!ndk) return;

      const user = ndk.getUser({ pubkey: pubkey ?? undefined });
      
      user.fetchProfile().then((userProfile: NDKUserProfile | null) => {
        if (userProfile && !profile) {
          // Only update if we don't already have profile data
          profile = userProfile;
        }
      });
    }
  });

  async function handleSignOutClick() {
    logoutUser();
    profile = null;
  }

  function handleViewProfile() {
    if (npub) {
      goto(`/events?id=${encodeURIComponent(npub)}`);
    }
  }

  function shortenNpub(long: string | null | undefined) {
    if (!long) return "";
    return long.slice(0, 8) + "…" + long.slice(-4);
  }
</script>

<div class="relative">
  <div class="group">
    <button
      class="h-6 w-6 rounded-full p-0 border-0 bg-transparent cursor-pointer"
      id="profile-avatar"
      type="button"
      aria-label="Open profile menu"
    >
      <Avatar
        rounded
        class="h-6 w-6 cursor-pointer"
        src={pfp}
        alt={username || "User"}
      />
    </button>
    <Popover
      placement="bottom"
      triggeredBy="#profile-avatar"
      class="popover-leather w-[180px]"
      trigger="click"
    >
      <div class="flex flex-row justify-between space-x-4">
        <div class="flex flex-col">
          {#if username}
            <h3 class="text-lg font-bold">{username}</h3>
            {#if isNav}<h4 class="text-base">@{tag}</h4>{/if}
          {:else}
            <h3 class="text-lg font-bold">Loading...</h3>
          {/if}
          <ul class="space-y-2 mt-2">
            <li>
              <CopyToClipboard
                displayText={shortenNpub(npub) || "Loading..."}
                copyText={npub || ""}
              />
            </li>
            <li>
              <button
                class="hover:text-primary-400 dark:hover:text-primary-500 text-nowrap mt-3 m-0 text-left"
                onclick={handleViewProfile}
              >
                <UserOutline
                  class="mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none"
                /><span class="underline">View profile</span>
              </button>
            </li>
            <li>
              <NetworkStatus />
            </li>
            {#if isNav}
              <li>
                <button
                  id="sign-out-button"
                  class="btn-leather text-nowrap mt-3 flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500"
                  onclick={handleSignOutClick}
                >
                  <ArrowRightToBracketOutline
                    class="mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none"
                  /> Sign out
                </button>
              </li>
            {:else}
              <!-- li>
              <button
                class='btn-leather text-nowrap mt-3 flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500'
              >
                <FileSearchOutline class='mr-1 !h-6 inline !fill-none dark:!fill-none' /> More content
              </button>
            </li -->
            {/if}
          </ul>
        </div>
      </div>
    </Popover>
  </div>
</div>
