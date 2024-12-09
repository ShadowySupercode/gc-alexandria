<script lang="ts">
	import Article from '$lib/components/Article.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let { event } = data;
</script>

<main>
	<Article index={event} />
</main>
