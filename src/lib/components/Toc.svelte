<script lang="ts">
	import type { NDKEvent } from '@nostr-dev-kit/ndk';
 	import {nip19} from 'nostr-tools';
	export let notes: NDKEvent[] = [];
    // check if notes is empty
    if (notes.length === 0) {
        console.debug('notes is empty');
    }
</script>

<div class="toc">
	<h2 class="toc-title">Table of contents</h2>
	<ul>
		{#each notes as note}
			<li><a href="#{nip19.noteEncode(note.id)}">{note.getMatchingTags('title')[0][1]}</a></li>
		{/each}
	</ul>
</div>
