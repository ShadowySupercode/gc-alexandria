<script lang='ts'>
  import { Avatar } from 'flowbite-svelte';
  import NDK, { type NDKUserProfile } from "@nostr-dev-kit/ndk";
  import { ndkInstance } from '$lib/ndk';
  import { userBadge } from '$lib/snippets/UserSnippets.svelte';

  // Component configuration types
  type AvatarSize = 'sm' | 'md' | 'lg';

  // Component props interface
  interface $$Props {
    pubkey: string;      // Required: The Nostr public key of the user
    name?: string | null; // Optional: Display name override
    showAvatar?: boolean; // Optional: Whether to show the avatar (default: true)
    avatarSize?: AvatarSize; // Optional: Size of the avatar (default: 'md')
  }

  // Destructure and set default props
  let { 
    pubkey, 
    name = null, 
    showAvatar = true,
    avatarSize = 'md' as AvatarSize
  } = $props();

  console.log('[InlineProfile] Initialized with props:', {
    pubkey,
    name,
    showAvatar,
    avatarSize
  });

  // Constants
  const EXTERNAL_PROFILE_DESTINATION = './events?id=';

  // Component state type definition
  type ProfileState = {
    loading: boolean;    // Whether we're currently loading the profile
    error: string | null; // Any error that occurred during loading
    profile: NDKUserProfile | null; // The user's profile data
    npub: string;        // The user's npub (bech32 encoded pubkey)
  };

  // Initialize component state
  let state = $state<ProfileState>({
    loading: true,
    error: null,
    profile: null,
    npub: ''
  });

  // Derived values from state
  const pfp = $derived(state.profile?.image);
  const username = $derived(state.profile?.name);
  const isAnonymous = $derived(!state.profile?.name && !name);

  // Log derived values reactively when they change
  $effect(() => {
    console.log('[InlineProfile] Derived values updated:', {
      pfp,
      username,
      isAnonymous,
      hasProfile: !!state.profile,
      hasNpub: !!state.npub,
      profileState: {
        loading: state.loading,
        error: state.error,
        hasProfile: !!state.profile,
        npub: state.npub
      }
    });
  });

  // Avatar size classes mapping
  const avatarClasses: Record<AvatarSize, string> = {
    sm: 'h-5 w-5',
    md: 'h-7 w-7',
    lg: 'h-9 w-9'
  };

  /**
   * Fetches user data from NDK
   * @param pubkey - The Nostr public key to fetch data for
   */
  async function fetchUserData(pubkey: string) {
    console.log('[InlineProfile] fetchUserData called with pubkey:', pubkey);
    
    if (!pubkey) {
      console.warn('[InlineProfile] No pubkey provided to fetchUserData');
      state.error = 'No pubkey provided';
      state.loading = false;
      return;
    }

    try {
      console.log('[InlineProfile] Getting NDK instance');
      const ndk = $ndkInstance as NDK;
      
      console.log('[InlineProfile] Creating NDK user object');
      const user = ndk.getUser({ pubkey });
      
      console.log('[InlineProfile] Getting npub');
      state.npub = user.npub;
      console.log('[InlineProfile] Got npub:', state.npub);

      console.log('[InlineProfile] Fetching user profile');
      const userProfile = await user.fetchProfile();
      console.log('[InlineProfile] Got user profile:', {
        name: userProfile?.name,
        displayName: userProfile?.displayName,
        nip05: userProfile?.nip05,
        hasImage: !!userProfile?.image
      });
      
      state.profile = userProfile;
      state.loading = false;
    } catch (error) {
      console.error('[InlineProfile] Error fetching user data:', error);
      state.error = error instanceof Error ? error.message : 'Failed to fetch profile';
      state.loading = false;
    }
  }

  /**
   * Shortens an npub string for display
   * @param long - The npub string to shorten
   * @returns Shortened npub string
   */
  function shortenNpub(long: string | undefined): string {
    if (!long) return '';
    const shortened = `${long.slice(0, 8)}…${long.slice(-4)}`;
    console.log('[InlineProfile] Shortened npub:', { original: long, shortened });
    return shortened;
  }

  // Effect to fetch user data when pubkey changes
  $effect(() => {
    console.log('[InlineProfile] Effect triggered, pubkey:', pubkey);
    if (pubkey) {
      fetchUserData(pubkey);
    } else {
      console.warn('[InlineProfile] No pubkey available for effect');
    }
  });
</script>

<!-- Component Template -->
{#if state.loading}
  <!-- Loading state -->
  <span class="animate-pulse" title="Loading profile...">
    {name ?? '…'}
  </span>
{:else if state.error}
  <!-- Error state -->
  <span class="text-red-500" title={state.error}>
    {name ?? shortenNpub(pubkey)}
  </span>
{:else if isAnonymous}
  <!-- Anonymous user state -->
  {@render userBadge(pubkey, name)}
{:else if state.npub}
  <!-- Authenticated user with profile -->
  <a 
    href={EXTERNAL_PROFILE_DESTINATION + state.npub} 
    title={name ?? username}
    class="inline-flex items-center hover:opacity-80 transition-opacity"
  >
    {#if showAvatar}
      <Avatar 
        rounded
        class={`${avatarClasses[avatarSize]} mx-1 cursor-pointer inline bg-transparent`}
        src={pfp}
        alt={username ?? 'User avatar'} 
      />
    {/if}
    {@render userBadge(pubkey, name)}
  </a>
{:else}
  <!-- Fallback state -->
  <span title="No profile data available">
    {name ?? shortenNpub(pubkey)}
  </span>
{/if}