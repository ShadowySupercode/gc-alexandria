<script lang="ts">
  import { onMount } from "svelte";
  import { Heading, P } from "flowbite-svelte";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { userStore } from "$lib/stores/userStore";
  import { userPubkey, isLoggedIn } from "$lib/stores/authStore.Svelte";
  import { ndkInstance, activeInboxRelays } from "$lib/ndk";
  import { neventEncode } from "$lib/utils";
  import { getUserMetadata, NDKRelaySetFromNDK } from "$lib/utils/nostrUtils";
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { nip19 } from "nostr-tools";
  import { communityRelays, localRelays } from "$lib/consts";

  const { event } = $props<{ event: NDKEvent }>();

  // Component state
  let notifications = $state<NDKEvent[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let isOwnProfile = $state(false);
  let notificationMode = $state<"to-me" | "from-me">("to-me");
  let authorProfiles = $state<Map<string, { name?: string; displayName?: string; picture?: string }>>(new Map());

  // Check if user is viewing their own profile
  $effect(() => {
    if ($userStore.signedIn && $userStore.pubkey && event.pubkey) {
      isOwnProfile = $userStore.pubkey.toLowerCase() === event.pubkey.toLowerCase();
    } else {
      isOwnProfile = false;
    }
  });

  // Fetch notifications when viewing own profile or when mode changes
  $effect(() => {
    if (isOwnProfile && $userStore.pubkey && $userStore.signedIn) {
      fetchNotifications();
    } else {
      // Clear notifications when user logs out or is not viewing own profile
      notifications = [];
      authorProfiles.clear();
    }
  });

  async function fetchNotifications() {
    if (!$userStore.pubkey || !isOwnProfile) return;

    loading = true;
    error = null;

    try {
      const ndk = get(ndkInstance);
      if (!ndk) {
        throw new Error("No NDK instance available");
      }

      // Collect all available relays for notification discovery
      const userInboxRelays = $userStore.relays.inbox || [];
      const userOutboxRelays = $userStore.relays.outbox || [];
      const activeInboxRelayList = get(activeInboxRelays);
      
      // Combine user's relays, local relays, community relays, and active inbox relays
      const allRelays = [
        ...userInboxRelays,
        ...userOutboxRelays,
        ...localRelays,
        ...communityRelays,
        ...activeInboxRelayList
      ];

      // Remove duplicates
      const uniqueRelays = [...new Set(allRelays)];

      if (uniqueRelays.length === 0) {
        throw new Error("No relays available for notification discovery");
      }

      console.log("[Notifications] Using relays for discovery:", uniqueRelays);

      // Create filter based on notification mode
      let filter;
      if (notificationMode === "to-me") {
        // Events that mention the user (notifications TO me)
        filter = {
          kinds: [1, 1111, 9802, 6, 16, 24],
          "#p": [$userStore.pubkey], // Events that mention the user
          limit: 100,
        };
      } else {
        // Events authored by the user (notifications FROM me)
        filter = {
          kinds: [1, 1111, 9802, 6, 16, 24],
          authors: [$userStore.pubkey], // Events authored by the user
          limit: 100,
        };
      }

      console.log("[Notifications] Fetching notifications for user:", $userStore.pubkey);
      console.log("[Notifications] Mode:", notificationMode);
      console.log("[Notifications] Using filter:", filter);

      // Create a relay set from all available relays
      const relaySet = NDKRelaySetFromNDK.fromRelayUrls(uniqueRelays, ndk);

      const events = await ndk.fetchEvents(filter, undefined, relaySet);

      // Convert to array and filter out self-referential events
      const eventArray = Array.from(events);
      
      // Filter out self-referential events
      const filteredEvents = eventArray.filter(event => {
        if (notificationMode === "to-me") {
          // For "to-me" mode, exclude events where the user is the author
          return event.pubkey !== $userStore.pubkey;
        } else {
          // For "from-me" mode, exclude events where the user is mentioned in p tags
          const pTags = event.getMatchingTags("p");
          const isUserMentioned = pTags.some(tag => tag[1] === $userStore.pubkey);
          return !isUserMentioned;
        }
      });
      
      // Sort by creation time (newest first)
      filteredEvents.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

      // Take the newest 100
      notifications = filteredEvents.slice(0, 100);

      console.log("[Notifications] Found", notifications.length, "notifications");

      // Fetch profiles for all notification authors
      await fetchAuthorProfiles(notifications);

    } catch (err) {
      console.error("[Notifications] Error fetching notifications:", err);
      error = err instanceof Error ? err.message : "Failed to fetch notifications";
    } finally {
      loading = false;
    }
  }

  // Fetch author profiles with relay priority
  async function fetchAuthorProfiles(events: NDKEvent[]) {
    const uniquePubkeys = new Set<string>();
    events.forEach(event => {
      if (event.pubkey) {
        uniquePubkeys.add(event.pubkey);
      }
    });

    console.log(`[Notifications] Fetching profiles for ${uniquePubkeys.size} unique authors`);

    // Fetch profiles in parallel with relay priority
    const profilePromises = Array.from(uniquePubkeys).map(async (pubkey) => {
      try {
        const npub = toNpub(pubkey);
        if (!npub) return;

        // First try cache
        let profile = await getUserMetadata(npub, false);
        if (profile && (profile.name || profile.displayName || profile.picture)) {
          authorProfiles.set(pubkey, profile);
          return;
        }

        // If not in cache, try search relays first
        const searchRelays = [
          "wss://profiles.nostr1.com",
          "wss://aggr.nostr.land",
          "wss://relay.noswhere.com",
          "wss://nostr.wine",
          "wss://relay.damus.io",
          "wss://relay.nostr.band",
          "wss://freelay.sovbit.host"
        ];

        // Try search relays
        for (const relay of searchRelays) {
          try {
            const ndk = get(ndkInstance);
            if (!ndk) break;

            const relaySet = NDKRelaySetFromNDK.fromRelayUrls([relay], ndk);
            const profileEvent = await ndk.fetchEvent(
              { kinds: [0], authors: [pubkey] },
              undefined,
              relaySet
            );

            if (profileEvent) {
              const profileData = JSON.parse(profileEvent.content);
              const profile = {
                name: profileData.name,
                displayName: profileData.display_name || profileData.displayName,
                picture: profileData.picture || profileData.image
              };
              authorProfiles.set(pubkey, profile);
              return;
            }
          } catch (error) {
            console.warn(`[Notifications] Failed to fetch profile from ${relay}:`, error);
          }
        }

        // Finally try all available relays
        const userInboxRelays = $userStore.relays.inbox || [];
        const userOutboxRelays = $userStore.relays.outbox || [];
        const activeInboxRelayList = get(activeInboxRelays);
        
        const allRelays = [
          ...userInboxRelays,
          ...userOutboxRelays,
          ...localRelays,
          ...communityRelays,
          ...activeInboxRelayList
        ];

        const uniqueRelays = [...new Set(allRelays)];
        if (uniqueRelays.length > 0) {
          try {
            const ndk = get(ndkInstance);
            if (!ndk) return;

            const relaySet = NDKRelaySetFromNDK.fromRelayUrls(uniqueRelays, ndk);
            const profileEvent = await ndk.fetchEvent(
              { kinds: [0], authors: [pubkey] },
              undefined,
              relaySet
            );

            if (profileEvent) {
              const profileData = JSON.parse(profileEvent.content);
              const profile = {
                name: profileData.name,
                displayName: profileData.display_name || profileData.displayName,
                picture: profileData.picture || profileData.image
              };
              authorProfiles.set(pubkey, profile);
            }
          } catch (error) {
            console.warn(`[Notifications] Failed to fetch profile from all relays:`, error);
          }
        }

      } catch (error) {
        console.warn(`[Notifications] Failed to fetch profile for ${pubkey}:`, error);
      }
    });

    await Promise.allSettled(profilePromises);
    console.log(`[Notifications] Profile fetching complete`);
  }

  function toNpub(pubkey: string): string | null {
    if (!pubkey) return null;
    try {
      if (/^[a-f0-9]{64}$/i.test(pubkey)) {
        return nip19.npubEncode(pubkey);
      }
      if (pubkey.startsWith("npub1")) return pubkey;
      return null;
    } catch {
      return null;
    }
  }

  function getNotificationType(event: NDKEvent): string {
    switch (event.kind) {
      case 1:
        return "Reply";
      case 1111:
        return "Custom Reply";
      case 9802:
        return "Highlight";
      case 6:
        return "Repost";
      case 16:
        return "Generic Repost";
      case 24:
        return "Public Message";
      default:
        return `Kind ${event.kind}`;
    }
  }

  function getNeventUrl(event: NDKEvent): string {
    // Use the same relay set as for fetching notifications
    const userInboxRelays = $userStore.relays.inbox || [];
    const userOutboxRelays = $userStore.relays.outbox || [];
    const activeInboxRelayList = get(activeInboxRelays);
    
    const allRelays = [
      ...userInboxRelays,
      ...userOutboxRelays,
      ...localRelays,
      ...communityRelays,
      ...activeInboxRelayList
    ];
    
    const uniqueRelays = [...new Set(allRelays)];
    return neventEncode(event, uniqueRelays);
  }

  function navigateToEvent(nevent: string) {
    goto(`/events?id=${nevent}`);
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function truncateContent(content: string, maxLength: number = 300): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  }
</script>

{#if isOwnProfile && $userStore.signedIn}
  <div class="mb-6">
    <div class="flex items-center justify-between mb-4">
      <Heading tag="h3" class="h-leather">Notifications</Heading>
      
      <!-- Toggle between "to me" and "from me" -->
      <div class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
        <button
          class="px-3 py-1 text-sm font-medium rounded-md transition-colors {notificationMode === 'to-me' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}"
          onclick={() => {
            notificationMode = "to-me";
          }}
        >
          To Me
        </button>
        <button
          class="px-3 py-1 text-sm font-medium rounded-md transition-colors {notificationMode === 'from-me' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}"
          onclick={() => {
            notificationMode = "from-me";
          }}
        >
          From Me
        </button>
      </div>
    </div>
    
    {#if loading}
      <div class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span class="ml-2 text-gray-600 dark:text-gray-400">Loading notifications...</span>
      </div>
    {:else if error}
      <div class="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
        <P>Error loading notifications: {error}</P>
      </div>
    {:else if notifications.length === 0}
      <div class="p-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
        <P>No notifications {notificationMode === "to-me" ? "received" : "sent"} found.</P>
      </div>
    {:else}
      <div class="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each notifications.slice(0, 10) as notification}
            {@const authorProfile = authorProfiles.get(notification.pubkey)}
            <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <div class="flex items-start gap-3">
                <!-- Author Profile Picture -->
                <div class="flex-shrink-0">
                  {#if authorProfile?.picture}
                    <img
                      src={authorProfile.picture}
                      alt="Author avatar"
                      class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                      onerror={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  {:else}
                    <div class="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                      <span class="text-sm font-medium text-gray-600 dark:text-gray-300">
                        {(authorProfile?.displayName || authorProfile?.name || notification.pubkey.slice(0, 1)).toUpperCase()}
                      </span>
                    </div>
                  {/if}
                </div>
                
                <!-- Notification Content -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900 px-2 py-1 rounded">
                      {getNotificationType(notification)}
                    </span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {notification.created_at ? formatDate(notification.created_at) : "Unknown date"}
                    </span>
                  </div>
                  
                  <!-- Author Name -->
                  <div class="mb-2">
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {authorProfile?.displayName || authorProfile?.name || `${notification.pubkey.slice(0, 8)}...${notification.pubkey.slice(-4)}`}
                    </span>
                    {#if authorProfile?.name && authorProfile?.displayName && authorProfile.name !== authorProfile.displayName}
                      <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        (@{authorProfile.name})
                      </span>
                    {/if}
                  </div>
                  
                  {#if notification.content}
                    <div class="text-sm text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
                      {truncateContent(notification.content)}
                    </div>
                  {/if}
                  
                  <div class="flex items-center gap-2">
                    <button
                      class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 underline font-medium"
                      onclick={() => navigateToEvent(getNeventUrl(notification))}
                    >
                      View Event
                    </button>
                    <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      {getNeventUrl(notification).slice(0, 16)}...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
        
        {#if notifications.length > 10}
          <div class="p-4 text-center text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
            Showing 10 of {notifications.length} notifications {notificationMode === "to-me" ? "received" : "sent"}. Scroll to see more.
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if} 