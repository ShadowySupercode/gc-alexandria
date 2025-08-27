<script lang="ts">
import Notifications from "$lib/components/Notifications.svelte";
import { AAlert } from "$lib/a";
import { userStore } from "$lib/stores/userStore";
</script>

<div class="w-full max-w-3xl mx-auto mt-10 px-4">
{#if $userStore?.signedIn}
  <Notifications />
{:else}
  <AAlert color="blue">Please log in to view your notifications.</AAlert>
{/if}
</div>