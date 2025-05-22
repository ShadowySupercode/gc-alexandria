<script lang='ts'>
import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
import { logout, ndkInstance } from '$lib/ndk';
import { ArrowRightToBracketOutline, UserOutline, FileSearchOutline } from "flowbite-svelte-icons";
import { Avatar, Popover } from "flowbite-svelte";
import type { NDKUserProfile } from "@nostr-dev-kit/ndk";

const externalProfileDestination = './events?id='

let { pubkey, isNav = false } = $props();

let profile = $state<NDKUserProfile | null>(null);
let pfp = $derived(profile?.image);
let username = $derived(profile?.name);
let tag = $derived(profile?.name);
let npub = $state<string | undefined >(undefined);

$effect(() => {
  const user = $ndkInstance
    .getUser({ pubkey: pubkey ?? undefined });

  npub = user.npub;

  user.fetchProfile()
    .then(userProfile => {
      profile = userProfile;
    });
});

async function handleSignOutClick() {
  logout($ndkInstance.activeUser!);
  profile = null;
}

function shortenNpub(long: string|undefined) {
  if (!long) return '';
  return long.slice(0, 8) + '…' + long.slice(-4);
}
</script>

<div class="relative">
  {#if profile}
  <div class="group">
    <Avatar
      rounded
      class='h-6 w-6 cursor-pointer'
      src={pfp}
      alt={username}
      id="profile-avatar"
    />
    {#key username || tag}
      <Popover
        placement="bottom"
        triggeredBy="#profile-avatar"
        class='popover-leather w-[180px]'
        trigger='hover'
      >
        <div class='flex flex-row justify-between space-x-4'>
          <div class='flex flex-col'>
            {#if username}
              <h3 class='text-lg font-bold'>{username}</h3>
              {#if isNav}<h4 class='text-base'>@{tag}</h4>{/if}
            {/if}
            <ul class="space-y-2 mt-2">
              <li>
                <CopyToClipboard displayText={shortenNpub(npub)} copyText={npub} />
              </li>
              <li>
                <a class='hover:text-primary-400 dark:hover:text-primary-500 text-nowrap mt-3 m-0' href='{externalProfileDestination}{npub}' target='_blank'>
                  <UserOutline class='mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none' /><span class='underline'>View profile</span>
                </a>
              </li>
              {#if isNav}
                <li>
                  <button
                    id='sign-out-button'
                    class='btn-leather text-nowrap mt-3 flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500'
                    onclick={handleSignOutClick}
                  >
                    <ArrowRightToBracketOutline class='mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none' /> Sign out
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
    {/key}
  </div>
  {/if}
</div>
