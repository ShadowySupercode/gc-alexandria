<script lang="ts">
  import type { NostrProfile } from '$lib/nostr/types';
  import type { DisplayBadge } from '$lib/nostr/nip58';
  import ANostrBadgeRow from './ANostrBadgeRow.svelte';
  import { shortenBech32, displayNameFrom } from '$lib/nostr/format';
  import { verifyNip05 } from '$lib/nostr/nip05';
  import { onMount } from 'svelte';

  let {
    npub,                               // required
    pubkey = undefined as string | undefined,
    profile = undefined as NostrProfile | undefined,
    size = 'md' as 'sm' | 'md' | 'lg',
    showNpub = true,
    showBadges = true,
    verifyNip05: doVerify = true,
    nip05Verified = undefined as boolean | undefined,
    nativeBadges = null as DisplayBadge[] | null,
    badgeLimit = 6,
    href = undefined as string | undefined,
    class: className = ''
  } = $props();

  // Derived view-model
  let displayName = displayNameFrom(npub, profile);
  let shortNpub = shortenBech32(npub, true);
  let avatarUrl = profile?.picture ?? '';
  let nip05 = profile?.nip05 ?? '';

  // NIP-05 verify
  let computedVerified = $state(false);
  let loadingVerify = $state(false);

  onMount(async () => {
    if (nip05Verified !== undefined) {
      computedVerified = nip05Verified;
      return;
    }
    if (!doVerify || !nip05 || !pubkey) return;
    loadingVerify = true;
    computedVerified = await verifyNip05(nip05, pubkey);
    loadingVerify = false;
  });

  // Sizing map
  const sizes = {
    sm: { avatar: 'h-6 w-6', gap: 'gap-2',   name: 'text-sm',  meta: 'text-[11px]' },
    md: { avatar: 'h-8 w-8', gap: 'gap-2.5', name: 'text-base',meta: 'text-xs'    },
    lg: { avatar: 'h-10 w-10',gap: 'gap-3',  name: 'text-lg',  meta: 'text-sm'    }
  }[size];
</script>

{#if href}
  <a href={href} class={`inline-flex items-center ${sizes.gap} ${className}`}>
    <Content />
  </a>
{:else}
  <div class={`inline-flex items-center ${sizes.gap} ${className}`}>
    <Content />
  </div>
{/if}

<!-- component content as a fragment (no extra <script> blocks, no JSX) -->
{#snippet Content()}
  <span class={`shrink-0 rounded-full overflow-hidden bg-muted/20 border border-muted/30 ${sizes.avatar}`}>
    {#if avatarUrl}
      <img src={avatarUrl} alt="" class="h-full w-full object-cover" />
    {:else}
      <span class="h-full w-full grid place-items-center text-xs opacity-70">
        {displayName.slice(0, 1).toUpperCase()}
      </span>
    {/if}
  </span>

  <span class="min-w-0">
    <span class={`flex items-center gap-1 font-medium ${sizes.name}`}>
      <span class="truncate">{displayName}</span>
      {#if nip05 && (computedVerified || loadingVerify)}
        <span class="inline-flex items-center"
              title={computedVerified ? `NIP-05 verified: ${nip05}` : 'Verifying…'}>
          {#if computedVerified}
            <!-- Verified check -->
            <svg class="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          {:else}
            <!-- Loading ring -->
            <svg class="h-4 w-4 animate-pulse opacity-70" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
          {/if}
        </span>
      {/if}
    </span>

    <span class={`flex items-center gap-2 text-muted/80 ${sizes.meta}`}>
      {#if nip05}<span class="truncate" title={nip05}>{nip05}</span>{/if}
      {#if showNpub}<span class="truncate opacity-80" title={npub}>{shortNpub}</span>{/if}
    </span>

    {#if showBadges}
      <span class="mt-1 block">
        <slot name="badges">
          {#if nativeBadges}
            <ANostrBadgeRow badges={nativeBadges} limit={badgeLimit} size="s" />
          {/if}
        </slot>
      </span>
    {/if}
  </span>
{/snippet}
