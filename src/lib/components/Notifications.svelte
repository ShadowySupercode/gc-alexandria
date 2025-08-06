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
  let publicMessages = $state<NDKEvent[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let isOwnProfile = $state(false);
  let notificationMode = $state<"to-me" | "from-me" | "public-messages">("to-me");
  let authorProfiles = $state<Map<string, { name?: string; displayName?: string; picture?: string }>>(new Map());
  let filteredByUser = $state<string | null>(null);

  // Derived state for filtered messages
  let filteredMessages = $derived.by(() => {
    if (!filteredByUser) return publicMessages;
    return publicMessages.filter(message => 
      message.pubkey === filteredByUser || 
      (message.pubkey === $userStore.pubkey && message.getMatchingTags("p").some(tag => tag[1] === filteredByUser))
    );
  });

  // AI-NOTE: Utility functions extracted to reduce code duplication
  function getAvailableRelays(): string[] {
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
    
    return [...new Set(allRelays)];
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

  function getNeventUrl(event: NDKEvent): string {
    const relays = getAvailableRelays();
    return neventEncode(event, relays);
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  }

  function truncateContent(content: string, maxLength: number = 300): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + "...";
  }

  function getNotificationType(event: NDKEvent): string {
    switch (event.kind) {
      case 1: return "Reply";
      case 1111: return "Custom Reply";
      case 9802: return "Highlight";
      case 6: return "Repost";
      case 16: return "Generic Repost";
      case 24: return "Public Message";
      default: return `Kind ${event.kind}`;
    }
  }

  function navigateToEvent(nevent: string) {
    goto(`/events?id=${nevent}`);
  }

  function filterByUser(pubkey: string) {
    filteredByUser = filteredByUser === pubkey ? null : pubkey;
  }

  function clearFilter() {
    filteredByUser = null;
  }

  // AI-NOTE: Simplified profile fetching with better error handling
  async function fetchAuthorProfiles(events: NDKEvent[]) {
    const uniquePubkeys = new Set<string>();
    events.forEach(event => {
      if (event.pubkey) uniquePubkeys.add(event.pubkey);
    });

    const profilePromises = Array.from(uniquePubkeys).map(async (pubkey) => {
      try {
        const npub = toNpub(pubkey);
        if (!npub) return;

        // Try cache first
        let profile = await getUserMetadata(npub, false);
        if (profile && (profile.name || profile.displayName || profile.picture)) {
          authorProfiles.set(pubkey, profile);
          return;
        }

        // Try search relays
        const searchRelays = [
          "wss://profiles.nostr1.com",
          "wss://aggr.nostr.land",
          "wss://relay.noswhere.com",
          "wss://nostr.wine",
          "wss://relay.damus.io",
          "wss://relay.nostr.band",
          "wss://freelay.sovbit.host"
        ];

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
              authorProfiles.set(pubkey, {
                name: profileData.name,
                displayName: profileData.display_name || profileData.displayName,
                picture: profileData.picture || profileData.image
              });
              return;
            }
          } catch (error) {
            console.warn(`[Notifications] Failed to fetch profile from ${relay}:`, error);
          }
        }

        // Try all available relays as fallback
        const relays = getAvailableRelays();
        if (relays.length > 0) {
          try {
            const ndk = get(ndkInstance);
            if (!ndk) return;

            const relaySet = NDKRelaySetFromNDK.fromRelayUrls(relays, ndk);
            const profileEvent = await ndk.fetchEvent(
              { kinds: [0], authors: [pubkey] },
              undefined,
              relaySet
            );

            if (profileEvent) {
              const profileData = JSON.parse(profileEvent.content);
              authorProfiles.set(pubkey, {
                name: profileData.name,
                displayName: profileData.display_name || profileData.displayName,
                picture: profileData.picture || profileData.image
              });
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
  }

  // AI-NOTE: Simplified notification fetching
  async function fetchNotifications() {
    if (!$userStore.pubkey || !isOwnProfile) return;

    loading = true;
    error = null;

    try {
      const ndk = get(ndkInstance);
      if (!ndk) throw new Error("No NDK instance available");

      const relays = getAvailableRelays();
      if (relays.length === 0) throw new Error("No relays available");

      const filter = {
        kinds: [1, 1111, 9802, 6, 16],
        ...(notificationMode === "to-me" 
          ? { "#p": [$userStore.pubkey] }
          : { authors: [$userStore.pubkey] }
        ),
        limit: 100,
      };

      const relaySet = NDKRelaySetFromNDK.fromRelayUrls(relays, ndk);
      const events = await ndk.fetchEvents(filter, undefined, relaySet);
      const eventArray = Array.from(events);
      
      // Filter out self-referential events
      const filteredEvents = eventArray.filter(event => {
        if (notificationMode === "to-me") {
          return event.pubkey !== $userStore.pubkey;
        } else {
          const pTags = event.getMatchingTags("p");
          const isUserMentioned = pTags.some(tag => tag[1] === $userStore.pubkey);
          return !isUserMentioned;
        }
      });
      
      notifications = filteredEvents
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, 100);

      await fetchAuthorProfiles(notifications);
    } catch (err) {
      console.error("[Notifications] Error fetching notifications:", err);
      error = err instanceof Error ? err.message : "Failed to fetch notifications";
    } finally {
      loading = false;
    }
  }

  // AI-NOTE: Simplified public messages fetching - only kind 24 messages
  async function fetchPublicMessages() {
    if (!$userStore.pubkey || !isOwnProfile) return;

    loading = true;
    error = null;

    try {
      const ndk = get(ndkInstance);
      if (!ndk) throw new Error("No NDK instance available");

      const relays = getAvailableRelays();
      if (relays.length === 0) throw new Error("No relays available");

      const relaySet = NDKRelaySetFromNDK.fromRelayUrls(relays, ndk);

      // Fetch only kind 24 messages
      const [messagesEvents, userMessagesEvents] = await Promise.all([
        ndk.fetchEvents({ kinds: [24 as any], "#p": [$userStore.pubkey], limit: 200 }, undefined, relaySet),
        ndk.fetchEvents({ kinds: [24 as any], authors: [$userStore.pubkey], limit: 200 }, undefined, relaySet)
      ]);

      const allMessages = [
        ...Array.from(messagesEvents),
        ...Array.from(userMessagesEvents)
      ];

      // Deduplicate and filter
      const uniqueMessages = allMessages.filter((event, index, self) => 
        index === self.findIndex(e => e.id === event.id)
      );

      publicMessages = uniqueMessages
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, 200);

      await fetchAuthorProfiles(publicMessages);
    } catch (err) {
      console.error("[PublicMessages] Error fetching public messages:", err);
      error = err instanceof Error ? err.message : "Failed to fetch public messages";
    } finally {
      loading = false;
    }
  }



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
      if (notificationMode === "public-messages") {
        fetchPublicMessages();
      } else {
        fetchNotifications();
      }
    } else {
      // Clear notifications when user logs out or is not viewing own profile
      notifications = [];
      publicMessages = [];
      authorProfiles.clear();
    }
  });
</script>

{#if isOwnProfile && $userStore.signedIn}
  <div class="mb-6">
    <div class="flex items-center justify-between mb-4">
      <Heading tag="h3" class="h-leather">Notifications</Heading>
      
      <!-- Mode toggle -->
      <div class="flex bg-gray-300 dark:bg-gray-700 rounded-lg p-1">
        {#each ["to-me", "from-me", "public-messages"] as mode}
          {@const modeLabel = mode === "to-me" ? "To Me" : mode === "from-me" ? "From Me" : "Public Messages"}
          <button
            class="px-3 py-1 text-sm font-medium rounded-md transition-colors {notificationMode === mode ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}"
            onclick={() => notificationMode = mode as "to-me" | "from-me" | "public-messages"}
          >
            {modeLabel}
          </button>
        {/each}
      </div>
    </div>
    
    {#if loading}
      <div class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span class="ml-2 text-gray-600 dark:text-gray-400">
          Loading {notificationMode === "public-messages" ? "public messages" : "notifications"}...
        </span>
      </div>
    {:else if error}
      <div class="p-4 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg">
        <P>Error loading {notificationMode === "public-messages" ? "public messages" : "notifications"}: {error}</P>
      </div>
    {:else if notificationMode === "public-messages"}
      {#if publicMessages.length === 0}
        <div class="p-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
          <P>No public messages found.</P>
        </div>
      {:else}
        <div class="max-h-[72rem] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          {#if filteredByUser}
            <div class="p-3 bg-blue-50 dark:bg-blue-900 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between">
                <span class="text-sm text-blue-700 dark:text-blue-300">
                  Filtered by user: {authorProfiles.get(filteredByUser)?.displayName || authorProfiles.get(filteredByUser)?.name || `${filteredByUser.slice(0, 8)}...${filteredByUser.slice(-4)}`}
                </span>
                <button
                  class="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline font-medium"
                  onclick={clearFilter}
                >
                  Clear Filter
                </button>
              </div>
            </div>
          {/if}
          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each filteredMessages.slice(0, 20) as message}
              {@const authorProfile = authorProfiles.get(message.pubkey)}
              {@const isFromUser = message.pubkey === $userStore.pubkey}
              <div class="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <div class="flex items-start gap-3 {isFromUser ? 'flex-row-reverse' : ''}">
                  <!-- Author Profile Picture -->
                  <div class="flex-shrink-0 relative">
                    {#if authorProfile?.picture}
                      <img
                        src={authorProfile.picture}
                        alt="Author avatar"
                        class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                        onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                      />
                    {:else}
                      <div class="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center border border-gray-200 dark:border-gray-600">
                        <span class="text-sm font-medium text-gray-600 dark:text-gray-300">
                          {(authorProfile?.displayName || authorProfile?.name || message.pubkey.slice(0, 1)).toUpperCase()}
                        </span>
                      </div>
                    {/if}
                    
                    <!-- Filter button for non-user messages -->
                    {#if !isFromUser}
                      <div class="mt-2 flex justify-center">
                        <button
                          class="w-6 h-6 bg-gray-400 hover:bg-gray-500 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-300 rounded-full flex items-center justify-center text-xs shadow-sm transition-colors {filteredByUser === message.pubkey ? 'ring-2 ring-gray-300 dark:ring-gray-400 bg-gray-500 dark:bg-gray-500' : ''}"
                          onclick={() => filterByUser(message.pubkey)}
                          title="Filter by this user"
                          aria-label="Filter by this user"
                        >
                          <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    {/if}
                  </div>
                  
                  <!-- Message Content -->
                  <div class="flex-1 min-w-0 {isFromUser ? 'text-right' : ''}">
                    <div class="flex items-center gap-2 mb-2 {isFromUser ? 'justify-end' : ''}">
                      <span class="text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900 px-2 py-1 rounded">
                        {isFromUser ? 'Your Message' : 'Public Message'}
                      </span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {message.created_at ? formatDate(message.created_at) : "Unknown date"}
                      </span>
                    </div>
                    
                    <!-- Author Name -->
                    <div class="mb-2 {isFromUser ? 'text-right' : ''}">
                      <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {authorProfile?.displayName || authorProfile?.name || `${message.pubkey.slice(0, 8)}...${message.pubkey.slice(-4)}`}
                      </span>
                      {#if authorProfile?.name && authorProfile?.displayName && authorProfile.name !== authorProfile.displayName}
                        <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">
                          (@{authorProfile.name})
                        </span>
                      {/if}
                    </div>
                    
                    {#if message.content}
                      <div class="text-sm text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
                        {truncateContent(message.content)}
                      </div>
                    {/if}
                    
                    <div class="flex items-center gap-2 {isFromUser ? 'justify-end' : ''}">
                      <button
                        class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 underline font-medium"
                        onclick={() => navigateToEvent(getNeventUrl(message))}
                      >
                        View Event
                      </button>
                      <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                        {getNeventUrl(message).slice(0, 16)}...
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
          
          {#if filteredMessages.length > 20}
            <div class="p-4 text-center text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
              Showing 20 of {filteredMessages.length} messages {filteredByUser ? `(filtered)` : ''}. Scroll to see more.
            </div>
          {/if}
        </div>
      {/if}
    {:else}
      {#if notifications.length === 0}
        <div class="p-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg">
          <P>No notifications {notificationMode === "to-me" ? "received" : "sent"} found.</P>
        </div>
      {:else}
        <div class="max-h-[72rem] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
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
                        onerror={(e) => (e.target as HTMLImageElement).style.display = 'none'}
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
    {/if}
  </div>
{/if} 