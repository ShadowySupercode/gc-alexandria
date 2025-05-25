<script lang='ts'>
import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
import { logout, ndkInstance } from '$lib/ndk';
import { ArrowRightToBracketOutline, UserOutline, ClipboardCleanOutline } from "flowbite-svelte-icons";
import { Avatar, Popover } from "flowbite-svelte";
import type { NostrProfile } from "$lib/utils/nostrUtils";
import { getUserMetadata } from "$lib/utils/nostrUtils";

const externalProfileDestination = './events?id='

let { pubkey } = $props();

let profile = $state<NostrProfile | null>(null);
let pfp = $derived.by(() => profile?.picture);
let username = $derived.by(() => profile?.display_name || profile?.name);
let tag = $derived.by(() => username);
let npub = $derived.by(() => $ndkInstance.getUser({ pubkey: pubkey ?? undefined })?.npub);

$effect(() => {
  const user = $ndkInstance.getUser({ pubkey: pubkey ?? undefined });
  if (user?.npub) {
    getUserMetadata(user.npub).then(metadata => {
      profile = metadata;
    });
  }
});

async function handleSignOutClick() {
  logout($ndkInstance.activeUser!);
  profile = null;
  // Clear all Alexandria/Nostr-related localStorage/sessionStorage
  localStorage.clear(); // or selectively remove only Alexandria keys if you want
  sessionStorage.clear();
  // Force a full page reload
  location.reload();
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
              <h4 class='text-base'>@{tag}</h4>
            {/if}
            <ul class="space-y-2 mt-2">
              <li>
                <CopyToClipboard icon={ClipboardCleanOutline} displayText={shortenNpub(npub)} copyText={npub} />
              </li>
              <li>
                <a class='hover:text-primary-400 dark:hover:text-primary-500 text-nowrap mt-3 m-0' href='{externalProfileDestination}{npub}'>
                  <UserOutline class='mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none' /><span class='underline'>View profile</span>
                </a>
              </li>
              <li>
                <button
                  id='sign-out-button'
                  class='btn-leather text-nowrap mt-3 flex w-full self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500'
                  onclick={handleSignOutClick}
                >
                  <ArrowRightToBracketOutline class='mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none' /> Sign out
                </button>
              </li>
              <!-- li>
                <button
                  class='btn-leather text-nowrap mt-3 flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500'
                >
                  <FileSearchOutline class='mr-1 !h-6 inline !fill-none dark:!fill-none' /> More content
                </button>
              </li -->
            </ul>
          </div>
        </div>
      </Popover>
    {/key}
  </div>
  {/if}
</div>
