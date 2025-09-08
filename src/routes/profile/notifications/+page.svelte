<script lang="ts">
import Notifications from "$lib/components/Notifications.svelte";
import { AAlert } from "$lib/a";
import { userStore } from "$lib/stores/userStore";
</script>

<div class="flex flex-col w-full max-w-3xl mx-auto px-2 items-center gap-4">
{#if $userStore?.signedIn}
  <Notifications />
{:else}
  <AAlert color="blue">Please log in to view your notifications.</AAlert>
{/if}
</div>