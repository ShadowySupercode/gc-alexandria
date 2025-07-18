<script lang="ts">
  import CopyToClipboard from "$components/util/CopyToClipboard.svelte";
  import NetworkStatus from "$components/NetworkStatus.svelte";
  import { 
    logoutUser, 
    userStore, 
    loginWithExtension,
    loginWithAmber,
    loginWithNpub
  } from "$lib/stores/userStore";
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
  import NDK, { NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
  import { onMount } from "svelte";
  import { getUserMetadata } from "$lib/utils/nostrUtils";
  import { activeInboxRelays } from "$lib/ndk";

  let { pubkey, isNav = false } = $props<{ pubkey?: string, isNav?: boolean }>();

  // UI state for login functionality
  let isLoadingExtension: boolean = $state(false);
  let isLoadingAmber: boolean = $state(false);
  let result: string | null = $state(null);
  let nostrConnectUri: string | undefined = $state(undefined);
  let showQrCode: boolean = $state(false);
  let qrCodeDataUrl: string | undefined = $state(undefined);
  let loginButtonRef: HTMLElement | undefined = $state();
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
  let pfp = $derived(profile?.picture);
  let username = $derived(profile?.name);
  let tag = $derived(profile?.name);
  let npub = $derived(userState.npub);

  // Debug logging
  $effect(() => {
    console.log("Profile component - userState:", userState);
    console.log("Profile component - profile:", profile);
    console.log("Profile component - pfp:", pfp);
    console.log("Profile component - username:", username);
  });

  // Handle user state changes with effects
  $effect(() => {
    const currentUser = userState;
    
    // Check for fallback flag when user state changes to signed in
    if (
      currentUser.signedIn &&
      localStorage.getItem("alexandria/amber/fallback") === "1" &&
      !showAmberFallback
    ) {
      console.log(
        "Profile: User signed in and fallback flag found, showing modal",
      );
      showAmberFallback = true;
    }

    // Set up periodic check when user is signed in
    if (currentUser.signedIn && !fallbackCheckInterval) {
      fallbackCheckInterval = setInterval(() => {
        if (
          localStorage.getItem("alexandria/amber/fallback") === "1" &&
          !showAmberFallback
        ) {
          console.log(
            "Profile: Found fallback flag during periodic check, showing modal",
          );
          showAmberFallback = true;
        }
      }, 500); // Check every 500ms
    } else if (!currentUser.signedIn && fallbackCheckInterval) {
      clearInterval(fallbackCheckInterval);
      fallbackCheckInterval = null;
    }
  });

  // Auto-refresh profile when user signs in
  $effect(() => {
    const currentUser = userState;
    
    // If user is signed in and we have an npub but no profile data, refresh it
    if (currentUser.signedIn && currentUser.npub && !profile?.name && !isRefreshingProfile) {
      console.log("Profile: User signed in but no profile data, refreshing...");
      refreshProfile();
    }
  });

  // Debug activeInboxRelays
  $effect(() => {
    const inboxRelays = get(activeInboxRelays);
    console.log("Profile component - activeInboxRelays:", inboxRelays);
  });

  // Track if we've already refreshed the profile for this session
  let hasRefreshedProfile = $state(false);
  
  // Reset the refresh flag when user logs out
  $effect(() => {
    const currentUser = userState;
    if (!currentUser.signedIn) {
      hasRefreshedProfile = false;
    }
  });
  
  // Manual trigger to refresh profile when user signs in (only once)
  $effect(() => {
    const currentUser = userState;
    
    if (currentUser.signedIn && currentUser.npub && !isRefreshingProfile && !hasRefreshedProfile) {
      console.log("Profile: User signed in, triggering profile refresh...");
      hasRefreshedProfile = true;
      // Add a small delay to ensure relays are ready
      setTimeout(() => {
        refreshProfile();
      }, 1000);
    }
  });

  // Refresh profile when login method changes (e.g., Amber to read-only)
  $effect(() => {
    const currentUser = userState;
    
    if (currentUser.signedIn && currentUser.npub && currentUser.loginMethod && !isRefreshingProfile) {
      console.log("Profile: Login method detected:", currentUser.loginMethod);
      
      // If switching to read-only mode (npub), refresh profile
      if (currentUser.loginMethod === "npub" && !hasRefreshedProfile) {
        console.log("Profile: Switching to read-only mode, refreshing profile...");
        hasRefreshedProfile = true;
        setTimeout(() => {
          refreshProfile();
        }, 500);
      }
    }
  });

  // Track login method changes and refresh profile when switching from Amber to npub
  let previousLoginMethod = $state<string | null>(null);
  
  $effect(() => {
    const currentUser = userState;
    
    if (currentUser.signedIn && currentUser.loginMethod !== previousLoginMethod && !isRefreshingProfile) {
      console.log("Profile: Login method changed from", previousLoginMethod, "to", currentUser.loginMethod);
      
      // If switching from Amber to npub (read-only), refresh profile
      if (previousLoginMethod === "amber" && currentUser.loginMethod === "npub" && !hasRefreshedProfile) {
        console.log("Profile: Switching from Amber to read-only mode, refreshing profile...");
        hasRefreshedProfile = true;
        setTimeout(() => {
          refreshProfile();
        }, 1000);
      }
      
      previousLoginMethod = currentUser.loginMethod;
    }
  });

  // Function to refresh profile data
  async function refreshProfile() {
    if (!userState.signedIn || !userState.npub) return;
    
    isRefreshingProfile = true;
    try {
      console.log("Refreshing profile for npub:", userState.npub);
      
      // Try using NDK's built-in profile fetching first
      const ndk = get(ndkInstance);
      if (ndk && userState.ndkUser) {
        console.log("Using NDK's built-in profile fetching");
        const userProfile = await userState.ndkUser.fetchProfile();
        console.log("NDK profile fetch result:", userProfile);
        
        if (userProfile) {
          const profileData = {
            name: userProfile.name,
            displayName: userProfile.displayName,
            nip05: userProfile.nip05,
            picture: userProfile.image,
            about: userProfile.bio,
            banner: userProfile.banner,
            website: userProfile.website,
            lud16: userProfile.lud16,
          };
          
          console.log("Converted profile data:", profileData);
          
          // Update the userStore with fresh profile data
          userStore.update(currentState => ({
            ...currentState,
            profile: profileData
          }));
          
          return;
        }
      }
      
      // Fallback to getUserMetadata
      console.log("Falling back to getUserMetadata");
      const freshProfile = await getUserMetadata(userState.npub, true); // Force fresh fetch
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
      await loginWithExtension();
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
        await loginWithAmber(amberSigner, user);
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
        await loginWithNpub(inputNpub);
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
    logoutUser();
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

  function shortenNpub(long: string | null | undefined) {
    if (!long) return "";
    return long.slice(0, 8) + "…" + long.slice(-4);
  }
</script>

<div class="relative">
  {#if !userState.signedIn}
    <!-- Login button -->
    <div class="group">
      <button
        bind:this={loginButtonRef}
        id="login-avatar"
        class="h-6 w-6 rounded-full bg-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-400 transition-colors"
      >
        <UserOutline class="h-4 w-4 text-gray-600" />
      </button>
      <Popover
        placement="bottom"
        triggeredBy="#login-avatar"
        class="popover-leather w-[200px]"
        trigger="click"
      >
        <div class="flex flex-col space-y-2">
          <h3 class="text-lg font-bold mb-2">Login with...</h3>
          <button
            class="btn-leather text-nowrap flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500 disabled:opacity-50"
            onclick={handleBrowserExtensionLogin}
            disabled={isLoadingExtension || isLoadingAmber}
          >
            {#if isLoadingExtension}
              🔄 Connecting...
            {:else}
              🌐 Browser extension
            {/if}
          </button>
          <button
            class="btn-leather text-nowrap flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500 disabled:opacity-50"
            onclick={handleAmberLogin}
            disabled={isLoadingAmber || isLoadingExtension}
          >
            {#if isLoadingAmber}
              🔄 Connecting...
            {:else}
              📱 Amber: NostrConnect
            {/if}
          </button>
          <button
            class="btn-leather text-nowrap flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500"
            onclick={handleReadOnlyLogin}
          >
            📖 npub (read only)
          </button>
          <div class="border-t border-gray-200 pt-2 mt-2">
            <div class="text-xs text-gray-500 mb-1">Network Status:</div>
            <NetworkStatus />
          </div>
        </div>
      </Popover>
      {#if result}
        <div
          class="absolute right-0 top-10 z-50 bg-gray-100 p-3 rounded text-sm break-words whitespace-pre-line max-w-lg shadow-lg border border-gray-300"
        >
          {result}
          <button
            class="ml-2 text-gray-500 hover:text-gray-700"
            onclick={() => (result = null)}>✖</button
          >
        </div>
      {/if}
    </div>
  {:else}
    <!-- User profile -->
    <div class="group">
      <button
        class="h-6 w-6 rounded-full p-0 border-0 bg-transparent cursor-pointer"
        id={profileAvatarId}
        type="button"
        aria-label="Open profile menu"
      >
        {#if !pfp}
          <div class="h-6 w-6 rounded-full bg-gray-300 animate-pulse cursor-pointer"></div>
        {:else}
          <Avatar
            rounded
            class="h-6 w-6 cursor-pointer"
            src={pfp}
            alt={username || "User"}
          />
        {/if}
      </button>
      <Popover
        placement="bottom"
        triggeredBy={`#${profileAvatarId}`}
        class="popover-leather w-[220px]"
        trigger="click"
      >
        <div class="flex flex-row justify-between space-x-4">
          <div class="flex flex-col">
            {#if username}
              <h3 class="text-lg font-bold">{username}</h3>
              {#if isNav}<h4 class="text-base">@{tag}</h4>{/if}
            {:else if !pfp}
              <h3 class="text-lg font-bold">Loading profile...</h3>
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

              <li class="text-xs text-gray-500">
                {#if userState.loginMethod === "extension"}
                  Logged in with extension
                {:else if userState.loginMethod === "amber"}
                  Logged in with Amber
                {:else if userState.loginMethod === "npub"}
                  Logged in with npub
                {:else}
                  Unknown login method
                {/if}
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
