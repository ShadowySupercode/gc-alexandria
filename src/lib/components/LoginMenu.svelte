<script lang="ts">
  import { Avatar, Popover } from "flowbite-svelte";
  import {
    UserOutline,
    ArrowRightToBracketOutline,
  } from "flowbite-svelte-icons";
  import {
    userStore,
    loginWithExtension,
    loginWithAmber,
    loginWithNpub,
    logoutUser,
  } from "$lib/stores/userStore";
  import { get } from "svelte/store";
  import NDK, { NDKNip46Signer, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";

  // UI state
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

  onMount(() => {
    if (localStorage.getItem("alexandria/amber/fallback") === "1") {
      console.log("LoginMenu: Found fallback flag on mount, showing modal");
      showAmberFallback = true;
    }
  });

  // Subscribe to userStore
  let user = $state(get(userStore));
  userStore.subscribe((val) => {
    user = val;
    // Check for fallback flag when user state changes to signed in
    if (
      val.signedIn &&
      localStorage.getItem("alexandria/amber/fallback") === "1" &&
      !showAmberFallback
    ) {
      console.log(
        "LoginMenu: User signed in and fallback flag found, showing modal",
      );
      showAmberFallback = true;
    }

    // Set up periodic check when user is signed in
    if (val.signedIn && !fallbackCheckInterval) {
      fallbackCheckInterval = setInterval(() => {
        if (
          localStorage.getItem("alexandria/amber/fallback") === "1" &&
          !showAmberFallback
        ) {
          console.log(
            "LoginMenu: Found fallback flag during periodic check, showing modal",
          );
          showAmberFallback = true;
        }
      }, 500); // Check every 500ms
    } else if (!val.signedIn && fallbackCheckInterval) {
      clearInterval(fallbackCheckInterval);
      fallbackCheckInterval = null;
    }
  });

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

  const handleLogout = () => {
    localStorage.removeItem("amber/nsec");
    localStorage.removeItem("alexandria/amber/fallback");
    logoutUser();
  };

  function handleAmberReconnect() {
    showAmberFallback = false;
    localStorage.removeItem("alexandria/amber/fallback");
    handleAmberLogin();
  }

  function handleAmberFallbackDismiss() {
    showAmberFallback = false;
    localStorage.removeItem("alexandria/amber/fallback");
  }

  function shortenNpub(long: string | undefined) {
    if (!long) return "";
    return long.slice(0, 8) + "…" + long.slice(-4);
  }

  function toNullAsUndefined(val: string | null): string | undefined {
    return val === null ? undefined : val;
  }

  function nullToUndefined(val: string | null | undefined): string | undefined {
    return val === null ? undefined : val;
  }
</script>

<div class="relative">
  {#if !user.signedIn}
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
        <Avatar
          rounded
          class="h-6 w-6 cursor-pointer"
          src={user.profile?.picture || undefined}
          alt={user.profile?.displayName || user.profile?.name || "User"}
        />
      </button>
      <Popover
        placement="bottom"
        triggeredBy={`#${profileAvatarId}`}
        class="popover-leather w-[220px]"
        trigger="click"
      >
        <div class="flex flex-row justify-between space-x-4">
          <div class="flex flex-col">
            <h3 class="text-lg font-bold">
              {user.profile?.displayName ||
                user.profile?.name ||
                (user.npub ? shortenNpub(user.npub) : "Unknown")}
            </h3>
            <ul class="space-y-2 mt-2">
              <li>
                <button
                  class="text-sm text-primary-600 dark:text-primary-400 underline hover:text-primary-400 dark:hover:text-primary-500 px-0 bg-transparent border-none cursor-pointer"
                  onclick={() => goto(`/events?id=${user.npub}`)}
                  type="button"
                >
                  {user.npub ? shortenNpub(user.npub) : "Unknown"}
                </button>
              </li>
              <li class="text-xs text-gray-500">
                {#if user.loginMethod === "extension"}
                  Logged in with extension
                {:else if user.loginMethod === "amber"}
                  Logged in with Amber
                {:else if user.loginMethod === "npub"}
                  Logged in with npub
                {:else}
                  Unknown login method
                {/if}
              </li>
              <li>
                <button
                  id="sign-out-button"
                  class="btn-leather text-nowrap mt-3 flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500"
                  onclick={handleLogout}
                >
                  <ArrowRightToBracketOutline
                    class="mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none"
                  /> Sign out
                </button>
              </li>
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
