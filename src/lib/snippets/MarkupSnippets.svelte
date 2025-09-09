<script module lang="ts">
  import { parseBasicMarkup } from "$lib/utils/markup/basicMarkupParser";
  import NDK from "@nostr-dev-kit/ndk";

  export { basicMarkup };
</script>

<!-- AI-NOTE: Use the snippet to parse basic markup, such as that found in the `content` field of 
many event kinds, into HTML. -->
{#snippet basicMarkup(text: string, ndk?: NDK)}
  {#await parseBasicMarkup(text, ndk) then parsed}
    {@html parsed}
  {:catch error: Error}
    <div class="text-red-500">Error processing markup: {error.message}</div>
  {/await}
{/snippet}
