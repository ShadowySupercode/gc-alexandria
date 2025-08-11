<script lang="ts">
  import { Heading, P } from "flowbite-svelte";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import { userStore } from "$lib/nostr/utils/auth/auth";
  import { ndkInstance } from "$lib/ndk";
  import { goto } from "$app/navigation";
  import { get } from "svelte/store";
  import { nip19 } from "nostr-tools";
  import { anonymousRelays } from "$lib/consts";
  import { getKind24RelaySet } from "$lib/utils/kind24_utils";
  import { createSignedEvent } from "$lib/utils/nostrEventService";
  import { Modal, Button } from "flowbite-svelte";
  import { searchProfiles } from "$lib/utils/search_utility";
  import type { NostrProfile } from "$lib/utils/search_types";
  import { PlusOutline, ReplyOutline } from "flowbite-svelte-icons";
  import { 
    truncateContent, 
    parseContent, 
    renderQuotedContent, 
    getNotificationType, 
    fetchAuthorProfiles 
  } from "$lib/utils/notification_utils";
  import { buildCompleteRelaySet } from "$lib/utils/relay_management";
  import { formatDate, neventEncode } from "$lib/utils";
  import { NDKRelaySetFromNDK } from "$lib/utils/nostrUtils";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";

  const { event } = $props<{ event: NDKEvent }>();

  // Handle navigation events from quoted messages
  $effect(() => {
    if (typeof window !== 'undefined') {
      const handleJumpToMessage = (e: Event) => {
        const customEvent = e as CustomEvent;
        jumpToMessageInFeed(customEvent.detail);
      };
      
      window.addEventListener('jump-to-message', handleJumpToMessage);
      
      return () => {
        window.removeEventListener('jump-to-message', handleJumpToMessage);
      };
    }
  });

  // Component state
  let notifications = $state<NDKEvent[]>([]);
  let publicMessages = $state<NDKEvent[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let isOwnProfile = $state(false);
  let notificationMode = $state<"to-me" | "from-me" | "public-messages">("to-me");
  let authorProfiles = $state<Map<string, { name?: string; displayName?: string; picture?: string }>>(new Map());
  let filteredByUser = $state<string | null>(null);

  
  // New Message Modal state
  let showNewMessageModal = $state(false);
  let newMessageContent = $state<string>("");
  let selectedRecipients = $state<NostrProfile[]>([]);
  let newMessageRelays = $state<string[]>([]);
  let isComposingMessage = $state(false);
  let replyToMessage = $state<NDKEvent | null>(null);
  let quotedContent = $state<string>("");
  
  // Recipient Selection Modal state
  let showRecipientModal = $state(false);
  let recipientSearch = $state("");
  let recipientResults = $state<NostrProfile[]>([]);
  let recipientLoading = $state(false);
  let recipientSearchInput = $state<HTMLInputElement | undefined>();
  let recipientSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let recipientCommunityStatus: Record<string, boolean> = $state({});
  let isRecipientSearching = $state(false);

  // Derived state for filtered messages
  let filteredMessages = $derived.by(() => {
    if (!filteredByUser) return publicMessages;
    return publicMessages.filter(message => 
      message.pubkey === filteredByUser || 
      (message.pubkey === $userStore.pubkey && message.getMatchingTags("p").some(tag => tag[1] === filteredByUser))
    );
  });

  // AI-NOTE: Utility functions extracted to reduce code duplication
  function getNeventUrl(event: NDKEvent): string {
    // Use empty relay list for nevent encoding - relays will be discovered by the events page
    return neventEncode(event, []);
  }

  function navigateToEvent(nevent: string) {
    // Navigate to the events search page with this specific event
    goto(`/events?id=${nevent}`);
  }

  function jumpToMessageInFeed(eventIdOrNevent: string) {
    // Switch to public messages tab and scroll to the specific message
    notificationMode = "public-messages";
    
    // Try to find and scroll to the specific message
    setTimeout(() => {
      let eventId = eventIdOrNevent;
      
      // If it's a nevent URL, try to extract the event ID
      if (eventIdOrNevent.startsWith('nostr:nevent') || eventIdOrNevent.startsWith('nevent')) {
        try {
          const decoded = nip19.decode(eventIdOrNevent);
          if (decoded.type === 'nevent' && decoded.data.id) {
            eventId = decoded.data.id;
          }
        } catch (error) {
          // If decode fails, try to extract hex ID directly
          const hexMatch = eventIdOrNevent.match(/[a-f0-9]{64}/i);
          if (hexMatch) {
            eventId = hexMatch[0];
          } else {
            console.warn('Failed to extract event ID from nevent:', eventIdOrNevent);
            return;
          }
        }
      }
      
      // Find the message in our public messages
      const targetMessage = publicMessages.find(msg => msg.id === eventId);
      if (targetMessage) {
        // Try to find the element in the DOM
        const element = document.querySelector(`[data-event-id="${eventId}"]`);
        if (element) {
          // Check if element is in viewport
          const rect = element.getBoundingClientRect();
          const isInView = (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
          
          // Only scroll if not in view
          if (!isInView) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          
          // ALWAYS highlight the message in blue
          element.classList.add('ring-2', 'ring-blue-500');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-blue-500');
          }, 2000);
        }
      }
    }, 100);
  }

  function filterByUser(pubkey: string) {
    filteredByUser = filteredByUser === pubkey ? null : pubkey;
  }

  function clearFilter() {
    filteredByUser = null;
  }



  // AI-NOTE: New Message Modal Functions
  function openNewMessageModal(messageToReplyTo?: NDKEvent) {
    showNewMessageModal = true;
    newMessageContent = "";
    selectedRecipients = [];
    newMessageRelays = [];
    isComposingMessage = false;
    replyToMessage = messageToReplyTo || null;
    
    // If replying, set up the quote and pre-select all original recipients plus sender
    if (messageToReplyTo) {
      // Store clean content for UI display (no markdown formatting)
      quotedContent = messageToReplyTo.content.length > 200 
        ? messageToReplyTo.content.slice(0, 200) + "..." 
        : messageToReplyTo.content;
      
      // Collect all recipients: original sender + all p-tag recipients
      const recipientPubkeys = new Set<string>();
      
      // Add the original sender
      recipientPubkeys.add(messageToReplyTo.pubkey);
      
      // Add all p-tag recipients from the original message
      const pTags = messageToReplyTo.getMatchingTags("p");
      pTags.forEach(tag => {
        if (tag[1]) {
          recipientPubkeys.add(tag[1]);
        }
      });
      
      // Remove the current user from recipients (don't reply to yourself)
      const currentUserPubkey = $userStore.pubkey;
      if (currentUserPubkey) {
        recipientPubkeys.delete(currentUserPubkey);
      }
      
      // Build the recipient list with profile information
      selectedRecipients = Array.from(recipientPubkeys).map(pubkey => {
        const profile = authorProfiles.get(pubkey);
        return {
          pubkey: pubkey,
          name: profile?.name || "",
          displayName: profile?.displayName || "",
          picture: profile?.picture || "",
          about: "", // We don't store about in authorProfiles
          nip05: "", // We don't store nip05 in authorProfiles
        };
      }).filter(recipient => recipient.pubkey); // Ensure we have valid pubkeys
      
      console.log(`Pre-loaded ${selectedRecipients.length} recipients for reply:`, selectedRecipients.map(r => r.displayName || r.name || r.pubkey?.slice(0, 8)));
    } else {
      quotedContent = "";
    }
  }

  function closeNewMessageModal() {
    showNewMessageModal = false;
    newMessageContent = "";
    selectedRecipients = [];
    newMessageRelays = [];
    isComposingMessage = false;
    replyToMessage = null;
    quotedContent = "";
  }

  // AI-NOTE: Recipient Selection Modal Functions
  function openRecipientModal() {
    showRecipientModal = true;
    recipientSearch = "";
    recipientResults = [];
    recipientLoading = false;
    recipientCommunityStatus = {};
    isRecipientSearching = false;
    // Focus the search input after a brief delay to ensure modal is rendered
    setTimeout(() => {
      recipientSearchInput?.focus();
    }, 100);
  }

  function closeRecipientModal() {
    showRecipientModal = false;
    recipientSearch = "";
    recipientResults = [];
    recipientLoading = false;
    recipientCommunityStatus = {};
    isRecipientSearching = false;
    
    // Clear any pending search timeout
    if (recipientSearchTimeout) {
      clearTimeout(recipientSearchTimeout);
      recipientSearchTimeout = null;
    }
  }

  async function searchRecipients() {
    if (!recipientSearch.trim()) {
      recipientResults = [];
      recipientCommunityStatus = {};
      return;
    }

    // Prevent multiple concurrent searches
    if (isRecipientSearching) {
      return;
    }

    console.log("Starting recipient search for:", recipientSearch.trim());

    // Set loading state
    recipientLoading = true;
    isRecipientSearching = true;

    try {
      console.log("Recipient search promise created, waiting for result...");
      const result = await searchProfiles(recipientSearch.trim());
      console.log("Recipient search completed, found profiles:", result.profiles.length);
      console.log("Profile details:", result.profiles);
      console.log("Community status:", result.Status);

      // Update state
      recipientResults = result.profiles;
      recipientCommunityStatus = result.Status;

      console.log(
        "State updated - recipientResults length:",
        recipientResults.length,
      );
      console.log(
        "State updated - recipientCommunityStatus keys:",
        Object.keys(recipientCommunityStatus),
      );
    } catch (error) {
      console.error("Error searching recipients:", error);
      recipientResults = [];
      recipientCommunityStatus = {};
    } finally {
      recipientLoading = false;
      isRecipientSearching = false;
      console.log(
        "Recipient search finished - loading:",
        recipientLoading,
        "searching:",
        isRecipientSearching,
      );
    }
  }

  // Reactive search with debouncing
  $effect(() => {
    // Clear existing timeout
    if (recipientSearchTimeout) {
      clearTimeout(recipientSearchTimeout);
    }

    // If search is empty, clear results immediately
    if (!recipientSearch.trim()) {
      recipientResults = [];
      recipientCommunityStatus = {};
      recipientLoading = false;
      return;
    }

    // Set loading state immediately for better UX
    recipientLoading = true;

    // Debounce the search with 300ms delay
    recipientSearchTimeout = setTimeout(() => {
      searchRecipients();
    }, 300);
  });

  function selectRecipient(profile: NostrProfile) {
    // Check if recipient is already selected
    if (selectedRecipients.some(r => r.pubkey === profile.pubkey)) {
      console.log("Recipient already selected:", profile.displayName || profile.name);
      return;
    }

    // Add recipient to selection
    selectedRecipients = [...selectedRecipients, profile];
    console.log("Selected recipient:", profile.displayName || profile.name);
    
    // Close the recipient modal (New Message modal stays open)
    closeRecipientModal();
  }

  async function sendNewMessage() {
    if (!newMessageContent.trim() || selectedRecipients.length === 0) return;

    try {
      isComposingMessage = true;
      
      // Create p-tags for all recipients (ensure hex format)
      const pTags = selectedRecipients.map(recipient => {
        let pubkey = recipient.pubkey!;
        // Convert npub to hex if needed
        if (pubkey.startsWith('npub')) {
          try {
            const decoded = nip19.decode(pubkey);
            if (decoded.type === 'npub') {
              pubkey = decoded.data;
            }
          } catch (e) {
            console.warn("[Send Message] Failed to decode npub:", pubkey, e);
          }
        }
        return ["p", pubkey];
      });
      
      // Add q tag if replying to a message (for jump-to functionality)
      if (replyToMessage) {
        pTags.push(["q", replyToMessage.id, newMessageRelays[0] || anonymousRelays[0]]);
      }
      
      // Get all recipient pubkeys for relay calculation (ensure hex format)
      const recipientPubkeys = selectedRecipients.map(r => {
        let pubkey = r.pubkey!;
        // Convert npub to hex if needed
        if (pubkey.startsWith('npub')) {
          try {
            const decoded = nip19.decode(pubkey);
            if (decoded.type === 'npub') {
              pubkey = decoded.data;
            }
          } catch (e) {
            console.warn("[Send Message Relay Calc] Failed to decode npub:", pubkey, e);
          }
        }
        return pubkey;
      });
      
      // Calculate relay set using the same logic as kind24_utils
      const senderPubkey = $userStore.pubkey;
      if (!senderPubkey) {
        throw new Error("No sender pubkey available");
      }
      
      // Get relay sets for all recipients and combine them
      const relaySetPromises = recipientPubkeys.map(recipientPubkey => 
        getKind24RelaySet(senderPubkey, recipientPubkey)
      );
      const relaySets = await Promise.all(relaySetPromises);
      
      // Combine and deduplicate all relay sets
      const allRelays = relaySets.flat();
      const uniqueRelays = [...new Set(allRelays)];
      newMessageRelays = uniqueRelays;
      
      // Use the content as-is, quoted content is handled via q tag
      const finalContent = newMessageContent;
      
      // Create and sign the event using the unified function (includes expiration tag)
      const { event: signedEvent } = await createSignedEvent(
        finalContent,
        $userStore.pubkey || '',
        24,
        pTags
      );

      // Publish to relays using WebSocket pool like other components
      const { WebSocketPool } = await import("$lib/data_structures/websocket_pool");
      let publishedToAny = false;

      for (const relayUrl of newMessageRelays) {
        try {
          const ws = await WebSocketPool.instance.acquire(relayUrl);
          
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              WebSocketPool.instance.release(ws);
              reject(new Error("Timeout"));
            }, 5000);

            ws.onmessage = (e) => {
              const [type, id, ok, message] = JSON.parse(e.data);
              if (type === "OK" && id === signedEvent.id) {
                clearTimeout(timeout);
                if (ok) {
                  publishedToAny = true;
                  WebSocketPool.instance.release(ws);
                  resolve();
                } else {
                  WebSocketPool.instance.release(ws);
                  reject(new Error(message));
                }
              }
            };

            ws.send(JSON.stringify(["EVENT", signedEvent]));
          });
        } catch (e) {
          console.warn(`Failed to publish to ${relayUrl}:`, e);
        }
      }

      if (publishedToAny) {
        // Close modal and refresh messages
        closeNewMessageModal();
        await fetchPublicMessages();
      } else {
        throw new Error("Failed to publish to any relay");
      }
    } catch (error) {
      console.error("Error sending new message:", error);
      // You could show an error message to the user here
    } finally {
      isComposingMessage = false;
    }
  }

  // AI-NOTE: Simplified notification fetching
  async function fetchNotifications() {
    if (!$userStore.pubkey || !isOwnProfile) return;

    loading = true;
    error = null;

    try {
      const ndk = get(ndkInstance);
      if (!ndk) throw new Error("No NDK instance available");
      
      const userStoreValue = get(userStore);
      const user = userStoreValue.signedIn && userStoreValue.pubkey ? ndk.getUser({ pubkey: userStoreValue.pubkey }) : null;
      const relaySet = await buildCompleteRelaySet(ndk, user);
      const relays = [...relaySet.inboxRelays, ...relaySet.outboxRelays];
      if (relays.length === 0) throw new Error("No relays available");

      const filter = {
        kinds: [1, 1111, 9802, 6, 16],
        ...(notificationMode === "to-me" 
          ? { "#p": [$userStore.pubkey] }
          : { authors: [$userStore.pubkey] }
        ),
        limit: 100,
      };

      const ndkRelaySet = NDKRelaySetFromNDK.fromRelayUrls(relays, ndk);
      const events = await ndk.fetchEvents(filter, undefined, ndkRelaySet);
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

      authorProfiles = await fetchAuthorProfiles(notifications);
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

      const userStoreValue = get(userStore);
      const user = userStoreValue.signedIn && userStoreValue.pubkey ? ndk.getUser({ pubkey: userStoreValue.pubkey }) : null;
      const relaySet = await buildCompleteRelaySet(ndk, user);
      const relays = [...relaySet.inboxRelays, ...relaySet.outboxRelays];
      if (relays.length === 0) throw new Error("No relays available");

      const ndkRelaySet = NDKRelaySetFromNDK.fromRelayUrls(relays, ndk);

      // Fetch only kind 24 messages
      const [messagesEvents, userMessagesEvents] = await Promise.all([
        ndk.fetchEvents({ kinds: [24 as any], "#p": [$userStore.pubkey], limit: 200 }, undefined, ndkRelaySet),
        ndk.fetchEvents({ kinds: [24 as any], authors: [$userStore.pubkey], limit: 200 }, undefined, ndkRelaySet)
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

      authorProfiles = await fetchAuthorProfiles(publicMessages);
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



  // AI-NOTE: Refactored to avoid blocking $effect with async operations
  // Calculate relay set when recipients change - non-blocking approach
  $effect(() => {
    const senderPubkey = $userStore.pubkey;
    console.log("[Relay Effect] Recipients changed:", selectedRecipients.length, "Sender:", senderPubkey?.slice(0, 8));
    
    if (selectedRecipients.length > 0 && senderPubkey) {
      // Start async relay set calculation without blocking the effect
      updateRelaySet(selectedRecipients, senderPubkey);
    } else {
      console.log("[Relay Effect] Clearing relays - no recipients or sender");
      newMessageRelays = [];
    }
  });

  /**
   * Updates relay set asynchronously to avoid blocking the reactive system
   */
  async function updateRelaySet(recipients: any[], senderPubkey: string) {
    try {
      const recipientPubkeys = recipients.map(r => {
        const pubkey = r.pubkey!;
        // Convert npub to hex if needed
        if (pubkey.startsWith('npub')) {
          try {
            const decoded = nip19.decode(pubkey) as unknown as { type: string; data: string };
            if (decoded.type === 'npub') {
              return decoded.data;
            }
          } catch (e) {
            console.warn("[Relay Effect] Failed to decode npub:", pubkey, e);
          }
        }
        return pubkey;
      });
      console.log("[Relay Effect] Getting relay sets for recipients (hex):", recipientPubkeys.map(p => p.slice(0, 8)));
      
      // Get relay sets for all recipients and combine them
      const relaySetPromises = recipientPubkeys.map(recipientPubkey => 
        getKind24RelaySet(senderPubkey, recipientPubkey)
      );
      
      const relaySets = await Promise.all(relaySetPromises);
      console.log("[Relay Effect] Received relay sets:", relaySets);
      
      // Combine and deduplicate all relay sets
      const allRelays = relaySets.flat();
      const uniqueRelays = [...new Set(allRelays)];
      console.log("[Relay Effect] Final relay list:", uniqueRelays);
      
      // If no relays found from NIP-65, use fallback relays
      if (uniqueRelays.length === 0) {
        console.log("[Relay Effect] No NIP-65 relays found, using fallback");
        const ndk = get(ndkInstance);
        if (ndk) {
          const userStoreValue = get(userStore);
          const user = userStoreValue.signedIn && userStoreValue.pubkey ? ndk.getUser({ pubkey: userStoreValue.pubkey }) : null;
          const relaySet = await buildCompleteRelaySet(ndk, user);
          const fallbackRelays = [...relaySet.inboxRelays, ...relaySet.outboxRelays];
          newMessageRelays = fallbackRelays.slice(0, 5); // Limit to first 5 for performance
        } else {
          newMessageRelays = [];
        }
      } else {
        newMessageRelays = uniqueRelays;
      }
    } catch (error) {
      console.error("[Relay Effect] Error getting relay set:", error);
      console.log("[Relay Effect] Using fallback relays due to error");
      const ndk = get(ndkInstance);
      if (ndk) {
        const userStoreValue = get(userStore);
        const user = userStoreValue.signedIn && userStoreValue.pubkey ? ndk.getUser({ pubkey: userStoreValue.pubkey }) : null;
        const relaySet = await buildCompleteRelaySet(ndk, user);
        const fallbackRelays = [...relaySet.inboxRelays, ...relaySet.outboxRelays];
        newMessageRelays = fallbackRelays.slice(0, 5);
      } else {
        newMessageRelays = [];
      }
    }
  }
</script>

{#if isOwnProfile && $userStore.signedIn}
  <div class="mb-6">
    <div class="flex items-center justify-between mb-4">
      <Heading tag="h3" class="h-leather">Notifications</Heading>
      
      <div class="flex items-center gap-3">
        <!-- New Message Button -->
        <Button
          color="primary"
          size="sm"
          onclick={() => openNewMessageModal()}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
        >
          <PlusOutline class="w-4 h-4" />
          New Message
        </Button>
      
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
    </div>
    
    {#if loading}
      <div class="flex items-center justify-center py-8 min-h-96">
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
        <div class="max-h-[72rem] overflow-y-auto">
          {#if filteredByUser}
            <div class="mb-4 p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
              <div class="flex items-center justify-between">
                <span class="text-sm text-blue-700 dark:text-blue-300">
                  Filtered by user: {@render userBadge(filteredByUser, authorProfiles.get(filteredByUser)?.displayName || authorProfiles.get(filteredByUser)?.name)}
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
          <div class="space-y-4">
            {#each filteredMessages.slice(0, 100) as message}
              {@const authorProfile = authorProfiles.get(message.pubkey)}
              {@const isFromUser = message.pubkey === $userStore.pubkey}
              <div class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all" data-event-id="{message.id}">
                <div class="flex items-start gap-3 {isFromUser ? 'flex-row-reverse' : ''}">
                  <!-- Author Profile Picture and Name -->
                  <div class="flex-shrink-0 relative">
                    <div class="flex items-center gap-2 {isFromUser ? 'flex-row-reverse' : ''}">
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
                      <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {@render userBadge(message.pubkey, authorProfile?.displayName || authorProfile?.name)}
                      </span>
                    </div>
                    
                    <!-- Filter button for non-user messages -->
                    {#if !isFromUser}
                      <div class="mt-2 flex flex-col gap-1">
                        <!-- Reply button -->
                        <button
                          class="w-6 h-6 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-full flex items-center justify-center text-xs shadow-sm transition-colors"
                          onclick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openNewMessageModal(message);
                          }}
                          title="Reply to this message"
                          aria-label="Reply to this message"
                        >
                          <ReplyOutline class="w-3 h-3" />
                        </button>
                        <!-- Filter button -->
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
                      <button
                        class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 underline font-mono"
                        onclick={() => navigateToEvent(getNeventUrl(message))}
                        title="Click to view event"
                      >
                        {getNeventUrl(message).slice(0, 16)}...
                      </button>
                    </div>
                    

                    
                    {#if message.getMatchingTags("q").length > 0}
                      <div class="text-sm text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
                        {#await renderQuotedContent(message, publicMessages) then quotedHtml}
                          {@html quotedHtml}
                        {:catch}
                          <!-- Fallback if quoted content fails to render -->
                        {/await}
                      </div>
                    {/if}
                    {#if message.content}
                      <div class="text-sm text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
                        {#await parseContent(message.content) then parsedContent}
                          {@html parsedContent}
                        {:catch}
                          {@html message.content}
                        {/await}
                      </div>
                    {/if}
                    

                  </div>
                </div>
                
              </div>
          {/each}
          </div>
          
          {#if filteredMessages.length > 100}
            <div class="mt-4 p-3 text-center text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
              Showing 100 of {filteredMessages.length} messages {filteredByUser ? `(filtered)` : ''}. Scroll to see more.
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
        <div class="max-h-[72rem] overflow-y-auto space-y-4">
          {#each notifications.slice(0, 100) as notification}
            {@const authorProfile = authorProfiles.get(notification.pubkey)}
            <div class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:shadow-md transition-all">
                <div class="flex items-start gap-3">
                  <!-- Author Profile Picture and Name -->
                  <div class="flex-shrink-0">
                    <div class="flex items-center gap-2">
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
                      <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {@render userBadge(notification.pubkey, authorProfile?.displayName || authorProfile?.name)}
                      </span>
                    </div>
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
                      <button
                        class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 underline font-mono"
                        onclick={() => navigateToEvent(getNeventUrl(notification))}
                        title="Click to view event"
                      >
                        {getNeventUrl(notification).slice(0, 16)}...
                      </button>
                    </div>
                    

                    
                    {#if notification.content}
                      <div class="text-sm text-gray-800 dark:text-gray-200 mb-2 leading-relaxed">
                        {#await parseContent(notification.content) then parsedContent}
                          {@html parsedContent}
                        {:catch}
                          {@html truncateContent(notification.content)}
                        {/await}
                      </div>
                    {/if}
                    

                  </div>
                </div>
            </div>
          {/each}
          
          {#if notifications.length > 100}
            <div class="mt-4 p-3 text-center text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
              Showing 100 of {notifications.length} notifications {notificationMode === "to-me" ? "received" : "sent"}. Scroll to see more.
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>
  
  <!-- New Message Modal -->
  <Modal bind:open={showNewMessageModal} size="lg" class="w-full">
    <div class="p-6">
      <div class="mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {replyToMessage ? 'Reply to Message' : 'New Public Message'}
        </h3>
      </div>
      
      <!-- Quoted Content Display -->
      {#if quotedContent}
        <div class="mb-4 p-3 bg-gray-100 dark:bg-gray-800 border-l-4 border-gray-400 dark:border-gray-500 rounded-r-lg">
          <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Replying to:</div>
          <div class="text-sm text-gray-800 dark:text-gray-200">
            {#await parseContent(quotedContent) then parsedContent}
              {@html parsedContent}
            {:catch}
              {@html quotedContent}
            {/await}
          </div>
  </div>
      {/if}
      
      <!-- Recipients Section -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Sending to {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''}:
          </span>
          <button
            class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openRecipientModal();
            }}
          >
            Edit Recipients
          </button>
        </div>
        
        {#if selectedRecipients.length === 0}
          <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <p class="text-sm text-yellow-700 dark:text-yellow-300">
              No recipients selected. Click "Edit Recipients" to add recipients.
            </p>
          </div>
        {:else}
          <div class="flex flex-wrap gap-2">
            {#each selectedRecipients as recipient}
              <span class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                {@render userBadge(recipient.pubkey!, recipient.displayName || recipient.name)}
                <button
                  onclick={() => {
                    selectedRecipients = selectedRecipients.filter(r => r.pubkey !== recipient.pubkey);
                  }}
                  class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ×
                </button>
              </span>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Relay Information -->
      {#if selectedRecipients.length > 0 && newMessageRelays.length > 0}
        <div class="mb-4">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Publishing to {newMessageRelays.length} relay{newMessageRelays.length !== 1 ? 's' : ''}:
          </span>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div class="space-y-1">
              {#each newMessageRelays as relay}
                <div class="text-xs font-mono text-gray-600 dark:text-gray-400">
                  {relay}
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
      
      <!-- Message Content -->
      <div class="mb-4">
        <label for="new-message-content" class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
          Message:
        </label>
        <textarea
          id="new-message-content"
          bind:value={newMessageContent}
          placeholder="Type your message here..."
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows="6"
          onkeydown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isComposingMessage && selectedRecipients.length > 0 && newMessageContent.trim()) {
              e.preventDefault();
              sendNewMessage();
            }
          }}
        ></textarea>
      </div>
      
      <!-- Action Buttons -->
      <div class="flex justify-end gap-3">
        <Button
          color="light"
          onclick={closeNewMessageModal}
          disabled={isComposingMessage}
        >
          Cancel
        </Button>
        <Button
          color="primary"
          onclick={sendNewMessage}
          disabled={isComposingMessage || selectedRecipients.length === 0 || !newMessageContent.trim()}
          class="flex items-center gap-2"
        >
          {#if isComposingMessage}
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          {/if}
          Send to {selectedRecipients.length} recipient{selectedRecipients.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  </Modal>
  
  <!-- Recipient Selection Modal -->
  <Modal bind:open={showRecipientModal} size="lg" class="w-full">
    <div class="p-6">
      <div class="mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Recipients</h3>
      </div>
      
      <div class="space-y-4">
        <div class="relative">
          <input
            type="text"
            placeholder="Search display name, name, NIP-05, or npub..."
            bind:value={recipientSearch}
            bind:this={recipientSearchInput}
            class="w-full rounded-lg border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500 p-2.5 {recipientLoading ? 'pr-10' : ''}"
          />
          {#if recipientLoading}
            <div class="absolute inset-y-0 right-0 flex items-center pr-3">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
            </div>
          {/if}
        </div>

        {#if recipientResults.length > 0}
          <div class="max-h-64 overflow-y-auto">
            <ul class="space-y-2">
              {#each recipientResults as profile}
                {@const isAlreadySelected = selectedRecipients.some(r => r.pubkey === profile.pubkey)}
                <button
                  onclick={() => selectRecipient(profile)}
                  disabled={isAlreadySelected}
                  class="w-full flex items-center gap-3 p-3 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors {isAlreadySelected ? 'opacity-50 cursor-not-allowed' : ''}"
                >
                  {#if profile.picture}
                    <img
                      src={profile.picture}
                      alt="Profile"
                      class="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
                      onerror={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  {:else}
                    <div
                      class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0"
                    ></div>
                  {/if}
                  <div class="flex flex-col text-left min-w-0 flex-1">
                    <span class="font-semibold truncate">
                      {@render userBadge(profile.pubkey!, profile.displayName || profile.name)}
                    </span>
                    {#if profile.nip05}
                      <span class="text-xs text-gray-500 flex items-center gap-1">
                        <svg
                          class="inline w-4 h-4 text-primary-500"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          viewBox="0 0 24 24"
                          ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          ></path></svg
                        >
                        {profile.nip05}
                      </span>
                    {/if}
                    {#if profile.about}
                      <span class="text-xs text-gray-500 truncate">{profile.about}</span>
                    {/if}
                  </div>
                  {#if recipientCommunityStatus[profile.pubkey || ""]}
                    <div
                      class="flex-shrink-0 w-4 h-4 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center"
                      title="Has posted to the community"
                    >
                      <svg
                        class="w-3 h-3 text-yellow-600 dark:text-yellow-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                        />
                      </svg>
                    </div>
                  {:else}
                    <div class="flex-shrink-0 w-4 h-4"></div>
                  {/if}
                  {#if isAlreadySelected}
                    <span class="text-xs text-green-600 dark:text-green-400 font-medium">Selected</span>
                  {/if}
                </button>
              {/each}
            </ul>
          </div>
        {:else if recipientSearch.trim()}
          <div class="text-center py-4 text-gray-500">No results found</div>
        {:else}
          <div class="text-center py-4 text-gray-500">
            Enter a search term to find users
          </div>
        {/if}
      </div>
    </div>
  </Modal>
{/if} 