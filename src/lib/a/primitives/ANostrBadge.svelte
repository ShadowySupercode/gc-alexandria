<script lang="ts">
  import type { DisplayBadge } from "$lib/nostr/nip58";
  export let badge: DisplayBadge;
  export let size: "xs" | "s" | "m" | "l" = "s";
  const px = { xs: 16, s: 24, m: 32, l: 48 }[size];
</script>

<span class="inline-flex items-center" title={badge.title}>
  {#if badge.thumbUrl}
    <img
      src={badge.thumbUrl}
      alt={badge.title}
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      class="rounded-md border border-muted/20 object-cover"
    />
  {:else}
    <span
      class="grid place-items-center rounded-md border border-muted/20 bg-surface text-xs"
      style={`width:${px}px;height:${px}px`}
    >
      {badge.title.slice(0, 1)}
    </span>
  {/if}
</span>
