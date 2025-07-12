<script lang='ts'>
  import { onMount } from 'svelte';
  import NDK, { NDKEvent, NDKNip46Signer, NDKPrivateKeySigner, NDKUser } from '@nostr-dev-kit/ndk';
  import { ndkInstance, ndkSignedIn, activePubkey } from '$lib/ndk';
  import { get } from 'svelte/store';

  // Component state
  let npub: string | null = $state(null);
  let signer: NDKNip46Signer | null = $state(null);
  let isLoading: boolean = $state(false);
  let result: string | null = $state(null);
  let nostrConnectUri: string | null = $state(null);
  let showQrCode: boolean = $state(false);
  let qrCodeDataUrl: string | null = $state(null);

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
      // Use a simple QR code library - we'll use a CDN version for simplicity
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

  // Generate Amber connection
  const handleGenerateAmberConnection = async () => {
    isLoading = true;
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
        
        // Update global state
        ndk.signer = amberSigner;
        ndk.activeUser = user;
        ndkInstance.set(ndk);
        ndkSignedIn.set(true);
        activePubkey.set(user.pubkey);
        
        result = `✅ Connected to Amber as ${user.npub}`;
        showQrCode = false;
      } else {
        throw new Error('Failed to generate Nostr Connect URI');
      }
    } catch (err: unknown) {
      result = `❌ Amber connection failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      isLoading = false;
    }
  };

  const handleSignEvent = async () => {
    if (!signer) return;
    
    try {
      const ndk = get(ndkInstance);
      if (!ndk) return;
      
      const event = new NDKEvent(ndk, { kind: 1, content: 'Hello from Alexandria!' });
      const sig = await withTimeout(event.sign(signer), 10000, 'Signing timed out');
      result = `✅ Signed event: ${sig}`;
    } catch (err: unknown) {
      result = `❌ Sign error: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  const handleLogout = () => {
    clearStoredNsec();
    clearStoredLoginMethod();
    clearStoredRelay();
    
    signer = null;
    npub = null;
    result = null;
    nostrConnectUri = null;
    showQrCode = false;
    qrCodeDataUrl = null;
    
    // Update global state
    ndkSignedIn.set(false);
    activePubkey.set(null);
  };
</script>

<div class='min-h-screen p-8 sm:p-20 flex items-center justify-center font-sans'>
  <div class='w-full max-w-md flex flex-col gap-6'>
    {#if !npub}
      <div class='text-center mb-6'>
        <h1 class='text-2xl font-bold text-gray-900 mb-2'>Welcome to Alexandria</h1>
        <p class='text-gray-600'>Connect with Amber to start reading and publishing</p>
      </div>
      
      {#if !showQrCode}
        <button
          class='bg-purple-600 hover:bg-purple-700 text-white py-3 px-6 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          onclick={handleGenerateAmberConnection}
          disabled={isLoading}
        >
          {#if isLoading}
            🔄 Generating QR code...
          {:else}
            🔗 Connect with Amber
          {/if}
        </button>
        
        <div class='text-sm text-gray-500 text-center'>
          <p>Click to generate a QR code for your mobile Amber app</p>
        </div>
      {:else}
        <div class='space-y-4'>
          <div class='text-center'>
            <h2 class='text-lg font-semibold text-gray-900 mb-2'>Scan with Amber</h2>
            <p class='text-sm text-gray-600 mb-4'>Open Amber on your phone and scan this QR code</p>
          </div>
          
          <!-- QR Code -->
          {#if qrCodeDataUrl}
            <div class='flex justify-center'>
              <img 
                src={qrCodeDataUrl} 
                alt='Nostr Connect QR Code'
                class='border-2 border-gray-300 rounded-lg'
                width='256'
                height='256'
              />
            </div>
          {/if}
          
          <!-- Copyable URI field -->
          <div class='space-y-2'>
            <label for='nostr-connect-uri' class='block text-sm font-medium text-gray-700'>Or copy the URI manually:</label>
            <div class='flex'>
              <input
                id='nostr-connect-uri'
                type='text'
                value={nostrConnectUri}
                readonly
                class='flex-1 border border-gray-300 rounded-l px-3 py-2 text-sm bg-gray-50'
                placeholder='nostrconnect://...'
              />
              <button
                class='bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-r text-sm font-medium transition-colors'
                onclick={() => copyToClipboard(nostrConnectUri || '')}
              >
                📋 Copy
              </button>
            </div>
          </div>
          
          <div class='text-xs text-gray-500 text-center'>
            <p>1. Open Amber on your phone</p>
            <p>2. Scan the QR code above</p>
            <p>3. Approve the connection in Amber</p>
          </div>
        </div>
      {/if}
    {:else}
      <div class='text-center mb-6'>
        <div class='text-green-600 font-semibold text-lg mb-2'>✅ Connected to Amber</div>
        <div class='text-gray-600 text-sm break-all'>{npub}</div>
      </div>

      <div class='space-y-3'>
        <button
          class='w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          onclick={handleSignEvent}
        >
          ✍️ Test Sign Event
        </button>

        <button 
          class='w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition-colors'
          onclick={handleLogout}
        >
          🚪 Disconnect Amber
        </button>
      </div>
    {/if}

    {#if result}
      <div class='text-sm bg-gray-100 p-3 rounded mt-4 break-words whitespace-pre-wrap'>
        {result}
      </div>
    {/if}
  </div>
</div>
