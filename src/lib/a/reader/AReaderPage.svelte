<script lang="ts">
  let { className = '' , content } = $props();
</script>

<article class="mx-auto max-w-measure font-reading leading-reading text-[1rem] {className}">
  {@render content()}
</article>
