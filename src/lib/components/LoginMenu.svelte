<script lang='ts'>
  import { onMount } from 'svelte';
  import NDK, { NDKEvent, NDKNip46Signer, NDKPrivateKeySigner, NDKUser, NDKNip07Signer, NDKRelaySet } from '@nostr-dev-kit/ndk';
  import { ndkInstance, ndkSignedIn, activePubkey, inboxRelays, outboxRelays, getPersistedLogin, persistLogin, clearLogin } from '$lib/ndk';
  import { get } from 'svelte/store';
  import { Avatar, Popover } from 'flowbite-svelte';
  import { UserOutline, ArrowRightToBracketOutline } from 'flowbite-svelte-icons';
  import { getUserMetadata, type NostrProfile } from '$lib/utils/nostrUtils';

  // Component state
  let npub: string | null = $state(null);
  let signer: NDKNip46Signer | NDKNip07Signer | null = $state(null);
  let isLoading: boolean = $state(false);
  let result: string | null = $state(null);
  let nostrConnectUri: string | null = $state(null);
  let showQrCode: boolean = $state(false);
  let qrCodeDataUrl: string | null = $state(null);
  let loginButtonRef: HTMLElement | undefined = $state();
  let profile: NostrProfile | null = $state(null);
  let profilePicture: string | undefined = $state(undefined);
  let profileHandle: string | undefined = $state(undefined);
  let resultTimeout: ReturnType<typeof setTimeout> | null = null;
  // Add a reference for the profile avatar
  let profileAvatarId = 'profile-avatar-btn';
  // Add separate loading states for each login method
  let isLoadingExtension: boolean = $state(false);
  let isLoadingAmber: boolean = $state(false);

  // Storage helpers
  const getStoredNsec = (): string | undefined => localStorage.getItem('amber/nsec') || undefined;
  const saveNsec = (nsec: string): void => localStorage.setItem('amber/nsec', nsec);
  const clearStoredNsec = (): void => localStorage.removeItem('amber/nsec');

  const getStoredLoginMethod = (): string | null => localStorage.getItem('amber/loginMethod');
  const saveLoginMethod = (method: string): void => localStorage.setItem('amber/loginMethod', method);
  const clearStoredLoginMethod = (): void => localStorage.removeItem('amber/loginMethod');

  const getStoredRelay = (): string => localStorage.getItem('amber/relay') || '';
  const saveRelay = (value: string): void => localStorage.setItem('amber/relay', value);
  const clearStoredRelay = (): void => localStorage.removeItem('amber/relay');

  // Timeout helper
  async function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
    let timeout: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).then((result) => {
      clearTimeout(timeout);
      return result;
    });
  }

  // Generate QR code
  const generateQrCode = async (text: string): Promise<string> => {
    try {
      const QRCode = await import('qrcode');
      return await QRCode.toDataURL(text, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      return '';
    }
  };

  // Copy to clipboard function
  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      result = '✅ URI copied to clipboard!';
    } catch (err) {
      result = '❌ Failed to copy to clipboard';
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

  // Fetch and set profile info after login
  async function fetchAndSetProfile(npubVal: string | null) {
    if (!npubVal) {
      profile = null;
      profilePicture = undefined;
      profileHandle = undefined;
      return;
    }
    const metadata = await getUserMetadata(npubVal);
    profile = metadata;
    profilePicture = metadata.picture || undefined;
    profileHandle = metadata.displayName || metadata.name || undefined;
  }

  // Auto-login effect
  onMount(() => {
    const tryAutoLogin = async () => {
      const localNsec = getStoredNsec();
      const loginMethod = getStoredLoginMethod();

      if (!localNsec || loginMethod !== 'amber') return;

      try {
        const relay = getStoredRelay();
        if (!relay) return;

        const ndk = get(ndkInstance);
        if (!ndk) return;

        const amberSigner = NDKNip46Signer.nostrconnect(ndk, relay, localNsec, {
          name: 'Alexandria',
          perms: 'sign_event:1;sign_event:4',
        });

        const user = await withTimeout(amberSigner.blockUntilReady(), 10000, 'Amber timeout');
        signer = amberSigner;
        npub = user.npub;
        await fetchAndSetProfile(npub);
        
        // Update global state
        ndk.signer = amberSigner;
        ndk.activeUser = user;
        ndkInstance.set(ndk);
        ndkSignedIn.set(true);
        activePubkey.set(user.pubkey);
      } catch (err: unknown) {
        clearStoredNsec();
        clearStoredLoginMethod();
        clearStoredRelay();
        console.error('Auto-login failed:', err instanceof Error ? err.message : String(err));
      }
    };

    tryAutoLogin();
  });

  // Browser extension login
  const handleBrowserExtensionLogin = async () => {
    isLoadingExtension = true;
    isLoadingAmber = false;
    try {
      const ndk = get(ndkInstance);
      if (!ndk) throw new Error('NDK not initialized');

      const extensionSigner = new NDKNip07Signer();
      const user = await extensionSigner.user();
      
      signer = extensionSigner;
      npub = user.npub;
      await fetchAndSetProfile(npub);
      
      // Update global state
      ndk.signer = extensionSigner;
      ndk.activeUser = user;
      ndkInstance.set(ndk);
      ndkSignedIn.set(true);
      activePubkey.set(user.pubkey);
      persistLogin(user);
      saveLoginMethod('extension');
      showResultMessage(`✅ Connected with browser extension as ${profileHandle || user.npub}`);
    } catch (err: unknown) {
      showResultMessage(`❌ Browser extension connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isLoadingExtension = false;
    }
  };

  // Amber login
  const handleAmberLogin = async () => {
    isLoadingAmber = true;
    isLoadingExtension = false;
    try {
      const ndk = get(ndkInstance);
      if (!ndk) throw new Error('NDK not initialized');

      const relay = 'wss://relay.nsec.app';
      const localNsec = getStoredNsec() ?? NDKPrivateKeySigner.generate().nsec;
      
      const amberSigner = NDKNip46Signer.nostrconnect(ndk, relay, localNsec, {
        name: 'Alexandria',
        perms: 'sign_event:1;sign_event:4',
      });

      if (amberSigner.nostrConnectUri) {
        nostrConnectUri = amberSigner.nostrConnectUri;
        showQrCode = true;
        
        // Generate QR code
        qrCodeDataUrl = await generateQrCode(amberSigner.nostrConnectUri);
        
        // Start waiting for connection
        const user = await withTimeout(amberSigner.blockUntilReady(), 15000, 'Amber timed out');
        
        saveLoginMethod('amber');
        saveNsec(amberSigner.localSigner.nsec);
        saveRelay(relay);
        
        signer = amberSigner;
        npub = user.npub;
        await fetchAndSetProfile(npub);
        
        // Update global state
        ndk.signer = amberSigner;
        ndk.activeUser = user;
        ndkInstance.set(ndk);
        ndkSignedIn.set(true);
        activePubkey.set(user.pubkey);
        persistLogin(user);
        
        showResultMessage(`✅ Connected to Amber as ${profileHandle || user.npub}`);
        showQrCode = false;
      } else {
        throw new Error('Failed to generate Nostr Connect URI');
      }
    } catch (err: unknown) {
      showResultMessage(`❌ Amber connection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      isLoadingAmber = false;
    }
  };

  // Read-only login (npub input)
  const handleReadOnlyLogin = async () => {
    const inputNpub = prompt('Enter your npub (public key):');
    if (inputNpub) {
      npub = inputNpub;
      await fetchAndSetProfile(npub);
      // Set NDK active user and update relays for read-only mode
      const ndk = get(ndkInstance);
      if (ndk) {
        const user = ndk.getUser({ npub: inputNpub });
        // Fetch and set relays (read-only, no signer)
        const [inboxes, outboxes] = await (async () => {
          try {
            // getUserPreferredRelays is not exported, so inline the logic here
            const relayList = await ndk.fetchEvent(
              { kinds: [10002], authors: [user.pubkey] },
              { groupable: false, skipVerification: false, skipValidation: false },
              NDKRelaySet.fromRelayUrls(['wss://relay.nsec.app'], ndk)
            );
            const inboxRelays = new Set();
            const outboxRelays = new Set();
            if (relayList == null) {
              // fallback: no relays found
            } else {
              relayList.tags.forEach(tag => {
                switch (tag[0]) {
                  case 'r': inboxRelays.add(tag[1]); break;
                  case 'w': outboxRelays.add(tag[1]); break;
                  default:
                    inboxRelays.add(tag[1]);
                    outboxRelays.add(tag[1]);
                    break;
                }
              });
            }
            return [inboxRelays, outboxRelays];
          } catch {
            return [new Set(), new Set()];
          }
        })();
        inboxRelays.set(Array.from(inboxes) as string[]);
        outboxRelays.set(Array.from(outboxes) as string[]);
        ndk.activeUser = user;
        ndk.signer = undefined;
        ndkInstance.set(ndk);
        ndkSignedIn.set(true);
        activePubkey.set(user.pubkey);
        persistLogin(user);
      }
    }
  };

  const handleLogout = () => {
    clearStoredNsec();
    clearStoredLoginMethod();
    clearStoredRelay();
    clearLogin();
    signer = null;
    npub = null;
    result = null;
    nostrConnectUri = null;
    showQrCode = false;
    qrCodeDataUrl = null;
    profile = null;
    profilePicture = undefined;
    profileHandle = undefined;
    
    // Update global state
    ndkSignedIn.set(false);
    activePubkey.set(null);
    // Reset NDK instance state
    const ndk = get(ndkInstance);
    if (ndk) {
      ndk.activeUser = undefined;
      ndk.signer = undefined;
      ndkInstance.set(ndk);
    }
  };

  function shortenNpub(long: string | undefined) {
    if (!long) return '';
    return long.slice(0, 8) + '…' + long.slice(-4);
  }
</script>

<div class="relative">
  {#if !npub}
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
        class='popover-leather w-[200px]'
        trigger='click'
      >
        <div class='flex flex-col space-y-2'>
          <h3 class='text-lg font-bold mb-2'>Login with...</h3>
          <button
            class='btn-leather text-nowrap flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500 disabled:opacity-50'
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
            class='btn-leather text-nowrap flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500 disabled:opacity-50'
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
            class='btn-leather text-nowrap flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500'
            onclick={handleReadOnlyLogin}
          >
            📖 npub (read only)
          </button>
        </div>
      </Popover>
      {#if result}
        <div class="absolute right-0 top-10 z-50 bg-gray-100 p-3 rounded text-sm break-words whitespace-pre-line max-w-lg shadow-lg border border-gray-300">
          {result}
          <button class="ml-2 text-gray-500 hover:text-gray-700" onclick={() => result = null}>✖</button>
        </div>
      {/if}
    </div>
  {:else}
    <!-- User profile -->
    <div class="group">
      <button
        class='h-6 w-6 rounded-full p-0 border-0 bg-transparent cursor-pointer'
        id={profileAvatarId}
        type='button'
        aria-label='Open profile menu'
      >
        <Avatar
          rounded
          class='h-6 w-6 cursor-pointer'
          src={profilePicture || undefined}
          alt={profileHandle || 'User'}
        />
      </button>
      <Popover
        placement="bottom"
        triggeredBy={`#${profileAvatarId}`}
        class='popover-leather w-[220px]'
        trigger='click'
      >
        <div class='flex flex-row justify-between space-x-4'>
          <div class='flex flex-col'>
            <h3 class='text-lg font-bold'>{profileHandle || shortenNpub(npub)}</h3>
            <ul class="space-y-2 mt-2">
              <li>
                <button
                  class='text-sm text-primary-600 dark:text-primary-400 underline hover:text-primary-400 dark:hover:text-primary-500 px-0 bg-transparent border-none cursor-pointer'
                  onclick={() => window.open(`./events?id=${npub}`, '_blank')}
                  type='button'
                >
                  {shortenNpub(npub)}
                </button>
              </li>
              <li>
                <button
                  id='sign-out-button'
                  class='btn-leather text-nowrap mt-3 flex self-stretch align-middle hover:text-primary-400 dark:hover:text-primary-500'
                  onclick={handleLogout}
                >
                  <ArrowRightToBracketOutline class='mr-1 !h-6 !w-6 inline !fill-none dark:!fill-none' /> Sign out
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
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="text-center">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Scan with Amber</h2>
        <p class="text-sm text-gray-600 mb-4">Open Amber on your phone and scan this QR code</p>
        
        <div class="flex justify-center mb-4">
          <img 
            src={qrCodeDataUrl} 
            alt="Nostr Connect QR Code"
            class="border-2 border-gray-300 rounded-lg"
            width="256"
            height="256"
          />
        </div>
        
        <div class="space-y-2">
          <label for="nostr-connect-uri-modal" class="block text-sm font-medium text-gray-700">Or copy the URI manually:</label>
          <div class="flex">
            <input
              id="nostr-connect-uri-modal"
              type="text"
              value={nostrConnectUri}
              readonly
              class="flex-1 border border-gray-300 rounded-l px-3 py-2 text-sm bg-gray-50"
              placeholder="nostrconnect://..."
            />
            <button
              class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-r text-sm font-medium transition-colors"
              onclick={() => copyToClipboard(nostrConnectUri || '')}
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
          onclick={() => showQrCode = false}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if} 