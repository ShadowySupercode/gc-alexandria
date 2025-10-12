<script lang="ts">
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import NetworkStatus from "$components/NetworkStatus.svelte";
  import { loginWithAmber, loginWithExtension, loginWithNpub, logoutUser, userStore } from "$lib/stores/userStore";
  import { Avatar, Dropdown, DropdownGroup, DropdownHeader, DropdownItem, P } from "flowbite-svelte";
  import { Book, Globe, Loader, Smartphone } from "@lucide/svelte";
  import { getBestDisplayName, getBestProfileValue } from "$lib/utils/profile_parsing";
  import { get } from "svelte/store";
  import { goto } from "$app/navigation";
  import NDK, { NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
  import { onMount } from "svelte";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import { activeInboxRelays, activeOutboxRelays, getNdkContext } from "$lib/ndk";
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { shortenNpub } from "$lib/utils/profile_parsing";

  const ndk = getNdkContext();

  // UI state for login functionality
  let isLoadingExtension: boolean = $state(false);
  let isLoadingAmber: boolean = $state(false);
  let result: string | null = $state(null);
  let nostrConnectUri: string | undefined = $state(undefined);
  let showQrCode: boolean = $state(false);
  let qrCodeDataUrl: string | undefined = $state(undefined);
  let resultTimeout: ReturnType<typeof setTimeout> | null = null;
  let profileAvatarId = "profile-avatar-btn";
  let showAmberFallback = $state(false);
  let fallbackCheckInterval: ReturnType<typeof setInterval> | null = null;
  let isRefreshingProfile = $state(false);

  onMount(() => {
    if (localStorage.getItem("alexandria/amber/fallback") === "1") {
      console.log("Profile: Found fallback flag on mount, showing modal");
      showAmberFallback = true;
    }
  });

  // Use profile data from userStore
  let userState = $derived($userStore);
  let profile = $derived(userState.profile);
  let npub = $derived(userState.npub);
  let pfp = $derived(getBestProfileValue(profile?.picture));
  let tag = $derived(getBestDisplayName(profile, npub || undefined));

  // Track if we've already refreshed the profile for this session
  let hasRefreshedProfile = $state(false);
  let previousLoginMethod = $state<string | null>(null);

  // Consolidated user state effect
  $effect(() => {
    const currentUser = userState;
    
    // Reset refresh flag when user logs out
    if (!currentUser.signedIn) {
      hasRefreshedProfile = false;
      previousLoginMethod = null;
      if (fallbackCheckInterval) {
        clearInterval(fallbackCheckInterval);
        fallbackCheckInterval = null;
      }
      return;
    }

    // Check for Amber fallback flag
    if (localStorage.getItem("alexandria/amber/fallback") === "1" && !showAmberFallback) {
      console.log("Profile: User signed in and fallback flag found, showing modal");
      showAmberFallback = true;
    }

    // Set up periodic check for fallback flag
    if (!fallbackCheckInterval) {
      fallbackCheckInterval = setInterval(() => {
        if (
          localStorage.getItem("alexandria/amber/fallback") === "1" &&
          !showAmberFallback
        ) {
          console.log("Profile: Found fallback flag during periodic check, showing modal");
          showAmberFallback = true;
        }
      }, 500);
    }

    // Handle profile refresh logic
    if (currentUser.npub && !isRefreshingProfile) {
      const shouldRefresh =
        !hasRefreshedProfile || // First time login
        (!profile && currentUser.signedIn) || // No profile data
        (currentUser.loginMethod === "npub" && !hasRefreshedProfile) || // Switching to read-only
        (previousLoginMethod === "amber" && currentUser.loginMethod === "npub" && !hasRefreshedProfile); // Amber to read-only

      if (shouldRefresh) {
        console.log("Profile: Triggering profile refresh for:", currentUser.loginMethod);
        hasRefreshedProfile = true;
        const delay = currentUser.loginMethod === "npub" ? 500 : 1000;
        setTimeout(() => refreshProfile(), delay);
      }
    }

    previousLoginMethod = currentUser.loginMethod;
  });

  // Function to refresh profile data
  async function refreshProfile() {
    if (!userState.signedIn || !userState.npub || isRefreshingProfile) return;
    
    isRefreshingProfile = true;
    try {
      console.log("Refreshing profile for npub:", userState.npub);
      
      // Check if we have relays available
      const inboxRelays = get(activeInboxRelays);
      const outboxRelays = get(activeOutboxRelays);
      
      if (inboxRelays.length === 0 && outboxRelays.length === 0) {
        console.log("Profile: No relays available, will retry when relays become available");
        // Set up a retry mechanism when relays become available
        const unsubscribe = activeInboxRelays.subscribe((relays) => {
          if (relays.length > 0 && !isRefreshingProfile) {
            console.log("Profile: Relays now available, retrying profile fetch");
            unsubscribe();
            setTimeout(() => refreshProfile(), 1000);
          }
        });
        return;
      }
      
      // Use our centralized profile fetching which handles migration properly
      const freshProfile = await getUserMetadata(userState.npub, ndk, true); // Force fresh fetch
      console.log("Fresh profile data from getUserMetadata:", freshProfile);
      
      // Update the userStore with fresh profile data
      userStore.update(currentState => ({
        ...currentState,
        profile: freshProfile
      }));
    } catch (error) {
      console.error("Failed to refresh profile:", error);
    } finally {
      isRefreshingProfile = false;
    }
  }



  // Generate QR code
  const generateQrCode = async (text: string): Promise<string> => {
    try {
      const QRCode = await import("qrcode");
      return await QRCode.toDataURL(text, {
        width: 256,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
    } catch (err) {
      console.error("Failed to generate QR code:", err);
      return "";
    }
  };

  // Copy to clipboard function
  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      result = "✅ URI copied to clipboard!";
    } catch (err) {
      result = "❌ Failed to copy to clipboard";
    }
  };

  // Helper to show result message near avatar and auto-dismiss
  function showResultMessage(msg: string) {
    result = msg;
    if (resultTimeout) {
      clearTimeout(resultTimeout);
    }
    resultTimeout = setTimeout(() => {
      result = null;
    }, 4000);
  }

  // Login handlers
  const handleBrowserExtensionLogin = async () => {
    isLoadingExtension = true;
    isLoadingAmber = false;
    try {
      await loginWithExtension(ndk);
    } catch (err: unknown) {
      showResultMessage(
        `❌ Browser extension connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      isLoadingExtension = false;
    }
  };

  const handleAmberLogin = async () => {
    isLoadingAmber = true;
    isLoadingExtension = false;
    try {
      const ndk = new NDK();
      const relay = "wss://relay.nsec.app";
      const localNsec =
        localStorage.getItem("amber/nsec") ??
        NDKPrivateKeySigner.generate().nsec;
      const amberSigner = NDKNip46Signer.nostrconnect(ndk, relay, localNsec, {
        name: "Alexandria",
        perms: "sign_event:1;sign_event:4",
      });
      if (amberSigner.nostrConnectUri) {
        nostrConnectUri = amberSigner.nostrConnectUri ?? undefined;
        showQrCode = true;
        qrCodeDataUrl =
          (await generateQrCode(amberSigner.nostrConnectUri)) ?? undefined;
        const user = await amberSigner.blockUntilReady();
        await loginWithAmber(amberSigner, user, ndk);
        showQrCode = false;
      } else {
        throw new Error("Failed to generate Nostr Connect URI");
      }
    } catch (err: unknown) {
      showResultMessage(
        `❌ Amber connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      isLoadingAmber = false;
    }
  };

  const handleReadOnlyLogin = async () => {
    const inputNpub = prompt("Enter your npub (public key):");
    if (inputNpub) {
      try {
        await loginWithNpub(inputNpub, ndk);
      } catch (err: unknown) {
        showResultMessage(
          `❌ npub login failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  async function handleSignOutClick() {
    localStorage.removeItem("amber/nsec");
    localStorage.removeItem("alexandria/amber/fallback");
    logoutUser(ndk);
  }

  function handleViewProfile() {
    if (npub) {
      goto(`/events?id=${encodeURIComponent(npub)}`);
    }
  }

  function handleAmberReconnect() {
    showAmberFallback = false;
    localStorage.removeItem("alexandria/amber/fallback");
    handleAmberLogin();
  }

  function handleAmberFallbackDismiss() {
    showAmberFallback = false;
    localStorage.removeItem("alexandria/amber/fallback");
    
    // Refresh profile when switching to read-only mode
    setTimeout(() => {
      console.log("Profile: Amber fallback dismissed, refreshing profile for read-only mode...");
      refreshProfile();
    }, 500);
  }

</script>

<div class="relative h-fit my-auto">
  {#if !userState.signedIn}
    <!-- Login button -->
    <Avatar size="xs" id="login-menu"/>
    <Dropdown placement="bottom" triggeredBy="#login-menu" class="min-w-xs">
      <DropdownGroup>
        <DropdownHeader>Login with...</DropdownHeader>
        <DropdownItem
          class="w-full"
          onclick={handleBrowserExtensionLogin}
          disabled={isLoadingExtension || isLoadingAmber}>
          <span class="w-full flex items-center justify-start gap-3">
            {#if isLoadingExtension}
              <Loader size={16} class="inline" /> Connecting...
            {:else}
              <Globe size={16} class="inline" /> Browser extension
            {/if}
          </span></DropdownItem>
        <DropdownItem
          class="w-full"
          onclick={handleAmberLogin}
          disabled={isLoadingAmber || isLoadingExtension}
          >
          <span class="w-full flex items-center justify-start gap-3">
          {#if isLoadingAmber}
              <Loader size={16} class="inline" /> Connecting...
            {:else}
              <Smartphone size={16} class="inline" />  Amber: NostrConnect
            {/if}
        </span>
        </DropdownItem>
        <DropdownItem
          class="w-full"
          onclick={handleReadOnlyLogin}
        >
          <span class="w-full flex items-center justify-start gap-3">
            <Book size={16} class="inline" /> npub (read only)
          </span>
        </DropdownItem>
        {#if result}
          <DropdownHeader class="flex gap-3">
            <P class="text-xs">
              {result}
            </P>
            <button
              class="inline ml-2 text-gray-500 hover:text-gray-700"
              onclick={() => (result = null)}>✖</button
            >
          </DropdownHeader>
        {/if}
      </DropdownGroup>
      <DropdownGroup>
        <DropdownHeader>
          <NetworkStatus />
        </DropdownHeader>
      </DropdownGroup>
    </Dropdown>
  {:else}
    <!-- User profile -->
    <Avatar
      src={pfp}
      alt={getBestDisplayName(profile, npub || undefined) || "User"}
      aria-label="Open profile menu"
      size="xs" id={profileAvatarId}/>
    <Dropdown placement="bottom" triggeredBy="#{profileAvatarId}" class="min-w-xs">
      <DropdownHeader>
        {#if npub}
          <span class="block text-sm">{@render userBadge(npub, undefined, ndk)}</span>
          <span class="block truncate text-sm font-medium">@{tag}</span>
        {:else if !pfp}
          <span>Loading profile...</span>
        {:else}
          <span>Loading...</span>
        {/if}
      </DropdownHeader>
      <DropdownGroup>
        <DropdownItem class="w-full">
          <CopyToClipboard
            displayText={shortenNpub(npub) || "Loading..."}
            copyText={npub || ""}
          />
        </DropdownItem>
      </DropdownGroup>
      <DropdownGroup>
        <DropdownItem
          class="w-full flex items-center justify-start"
          onclick={() => goto('/profile')}
        >
          View profile
        </DropdownItem>
        <DropdownItem
          class="w-full flex items-center justify-start "
          onclick={() => goto('/profile/my-notes')}
        >
          My notes
        </DropdownItem>
        <DropdownItem
          class="w-full flex items-center justify-start"
          onclick={() => goto('/profile/notifications')}
        >
          Notifications
        </DropdownItem>
      </DropdownGroup>
      <DropdownGroup>
        <DropdownHeader class="text-xs">
          {#if userState.loginMethod === "extension"}
            Logged in with extension
          {:else if userState.loginMethod === "amber"}
            Logged in with Amber
          {:else if userState.loginMethod === "npub"}
            Logged in with npub
          {:else}
            Unknown login method
          {/if}
        </DropdownHeader>
        <DropdownHeader><NetworkStatus /></DropdownHeader>
      </DropdownGroup>
      <DropdownGroup>
        <DropdownItem
          id="sign-out-button"
          class="w-full flex items-center justify-start "
          onclick={handleSignOutClick}
          >
          Sign out
        </DropdownItem>
      </DropdownGroup>
    </Dropdown>
  {/if}
</div>

{#if showQrCode && qrCodeDataUrl}
  <!-- QR Code Modal -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  >
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="text-center">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">
          Scan with Amber
        </h2>
        <p class="text-sm text-gray-600 mb-4">
          Open Amber on your phone and scan this QR code
        </p>
        <div class="flex justify-center mb-4">
          <img
            src={qrCodeDataUrl || ""}
            alt="Nostr Connect QR Code"
            class="border-2 border-gray-300 rounded-lg"
            width="256"
            height="256"
          />
        </div>
        <div class="space-y-2">
          <label
            for="nostr-connect-uri-modal"
            class="block text-sm font-medium text-gray-700"
            >Or copy the URI manually:</label
          >
          <div class="flex">
            <input
              id="nostr-connect-uri-modal"
              type="text"
              value={nostrConnectUri || ""}
              readonly
              class="flex-1 border border-gray-300 rounded-l px-3 py-2 text-sm bg-gray-50"
              placeholder="nostrconnect://..."
            />
            <button
              class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-r text-sm font-medium transition-colors"
              onclick={() => copyToClipboard(nostrConnectUri || "")}
            >
              📋 Copy
            </button>
          </div>
        </div>
        <div class="text-xs text-gray-500 mt-4">
          <p>1. Open Amber on your phone</p>
          <p>2. Scan the QR code above</p>
          <p>3. Approve the connection in Amber</p>
        </div>
        <button
          class="mt-4 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          onclick={() => (showQrCode = false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showAmberFallback}
  <div
    class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
  >
    <div
      class="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-lg border border-primary-300"
    >
      <div class="text-center">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">
          Amber Session Restored
        </h2>
        <p class="text-sm text-gray-600 mb-4">
          Your Amber wallet session could not be restored automatically, so
          you've been switched to read-only mode.<br />
          You can still browse and read content, but you'll need to reconnect Amber
          to publish or comment.
        </p>
        <button
          class="mt-4 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          onclick={handleAmberReconnect}
        >
          Reconnect Amber
        </button>
        <button
          class="mt-2 ml-4 bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded text-sm font-medium transition-colors"
          onclick={handleAmberFallbackDismiss}
        >
          Continue in Read-Only Mode
        </button>
      </div>
    </div>
  </div>
{/if}
