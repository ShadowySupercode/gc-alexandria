<script lang="ts">
  import { Button, Modal, Input } from "flowbite-svelte";
  import type { NostrProfile } from "$lib/utils/search_utility";

  const props = $props<{
    // Modal visibility states
    showMentionModal: boolean;
    showWikilinkModal: boolean;
    showImageModal: boolean;
    showLinkModal: boolean;
    showTableModal: boolean;
    showFootnoteModal: boolean;
    showHeadingModal: boolean;
    showEmojiModal: boolean;
    
    // Modal data
    mentionSearch: string;
    mentionResults: NostrProfile[];
    mentionLoading: boolean;
    communityStatus: Record<string, boolean>;
    wikilinkTarget: string;
    wikilinkLabel: string;
    imageUrl: string;
    imageAlt: string;
    linkUrl: string;
    linkText: string;
    tableData: { headers: string[]; rows: string[][] };
    footnoteId: string;
    footnoteText: string;
    headingLevel: number;
    headingText: string;
    
    // Callbacks
    onMentionSelect: (profile: NostrProfile) => void;
    onWikilinkInsert: () => void;
    onImageInsert: () => void;
    onLinkInsert: () => void;
    onTableInsert: () => void;
    onFootnoteInsert: () => void;
    onHeadingInsert: () => void;
    onEmojiSelect: (emoji: string) => void;
    onAddTableRow: () => void;
    onRemoveTableRow: (index: number) => void;
    onAddTableColumn: () => void;
    onRemoveTableColumn: (index: number) => void;
    onCloseModal: (modalName: string) => void;
    onImageUrlChange: (value: string) => void;
    onImageAltChange: (value: string) => void;
    onMentionSearchChange: (value: string) => void;
    onWikilinkTargetChange: (value: string) => void;
    onWikilinkLabelChange: (value: string) => void;
    onLinkUrlChange: (value: string) => void;
    onLinkTextChange: (value: string) => void;
    onTableHeaderChange: (index: number, value: string) => void;
    onTableCellChange: (rowIndex: number, colIndex: number, value: string) => void;
    onFootnoteIdChange: (value: string) => void;
    onFootnoteTextChange: (value: string) => void;
    onHeadingLevelChange: (value: number) => void;
    onHeadingTextChange: (value: string) => void;
  }>();

  // Helper function to shorten npub
  function shortenNpub(npub: string | undefined) {
    if (!npub) return "";
    return npub.slice(0, 8) + "…" + npub.slice(-4);
  }

  // Image loading timeout
  let imageLoadTimeout: ReturnType<typeof setTimeout> | undefined;

  function handleImageLoad(img: HTMLImageElement) {
    const loadingDiv = img.parentElement?.querySelector('.image-loading') as HTMLDivElement;
    const errorDiv = img.parentElement?.querySelector('.image-error') as HTMLDivElement;
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    img.style.display = 'block';
    
    if (imageLoadTimeout) {
      clearTimeout(imageLoadTimeout);
      imageLoadTimeout = undefined;
    }
  }

  function handleImageError(img: HTMLImageElement) {
    const loadingDiv = img.parentElement?.querySelector('.image-loading') as HTMLDivElement;
    const errorDiv = img.parentElement?.querySelector('.image-error') as HTMLDivElement;
    
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'block';
    img.style.display = 'none';
    
    if (imageLoadTimeout) {
      clearTimeout(imageLoadTimeout);
      imageLoadTimeout = undefined;
    }
  }

  function setupImageTimeout(img: HTMLImageElement) {
    if (imageLoadTimeout) clearTimeout(imageLoadTimeout);
    imageLoadTimeout = setTimeout(() => handleImageError(img), 10000);
  }
</script>

<!-- Mention Modal -->
{#if props.showMentionModal}
  <Modal class="modal-leather" title="Mention User" open={props.showMentionModal} autoclose outsideclose size="sm">
    <div class="space-y-4">
      <div class="flex gap-2">
        <input
          type="text"
          placeholder="Search users: @username, @domain.com, or name/npub... (min 2 chars)"
          value={props.mentionSearch}
          oninput={(e) => props.onMentionSearchChange((e.target as HTMLInputElement).value)}
          class="flex-1 rounded-lg border border-gray-300 bg-gray-50 text-gray-900 text-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-primary-500 dark:focus:ring-primary-500 p-2.5"
        />
        {#if props.mentionLoading}
          <div class="flex items-center text-sm text-gray-500">
            <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Searching...
          </div>
        {/if}
      </div>

      {#if props.mentionLoading}
        <div class="text-center py-4">Searching...</div>
      {:else if props.mentionResults.length > 0}
        <div class="text-center py-2 text-xs text-gray-500">Found {props.mentionResults.length} results</div>
        <div class="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <ul class="space-y-1 p-2">
            {#each props.mentionResults as profile}
              <button
                type="button"
                class="w-full text-left cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 p-2 rounded flex items-center gap-3"
                onclick={() => props.onMentionSelect(profile)}
              >
                {#if profile.pubkey && props.communityStatus[profile.pubkey]}
                  <div class="flex-shrink-0 w-6 h-6 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center" title="Has posted to the community">
                    <svg class="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </div>
                {:else}
                  <div class="flex-shrink-0 w-6 h-6"></div>
                {/if}
                {#if profile.picture}
                  <img src={profile.picture} alt="Profile" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                {:else}
                  <div class="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0"></div>
                {/if}
                <div class="flex flex-col text-left min-w-0 flex-1">
                  <span class="font-semibold truncate">{profile.displayName || profile.name || props.mentionSearch}</span>
                  {#if profile.nip05}
                    <span class="text-xs text-gray-500 flex items-center gap-1">
                      <svg class="inline w-4 h-4 text-primary-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {profile.nip05}
                    </span>
                  {/if}
                  <span class="text-xs text-gray-400 font-mono truncate">{shortenNpub(profile.pubkey)}</span>
                </div>
              </button>
            {/each}
          </ul>
        </div>
      {:else if props.mentionSearch.trim() && !props.mentionLoading}
        <div class="text-center py-4 text-gray-500">No results found</div>
      {:else if !props.mentionSearch.trim()}
        <div class="text-center py-4 text-gray-500">Start typing to search for users</div>
      {/if}
    </div>
  </Modal>
{/if}

<!-- Wikilink Modal -->
{#if props.showWikilinkModal}
  <Modal class="modal-leather" title="Insert Wikilink" open={props.showWikilinkModal} autoclose outsideclose size="sm">
    <Input
      type="text"
      placeholder="Target page (e.g. target page or target-page)"
      value={props.wikilinkTarget}
      oninput={(e) => props.onWikilinkTargetChange((e.target as HTMLInputElement).value)}
      class="mb-2"
    />
    <Input
      type="text"
      placeholder="Display text (optional)"
      value={props.wikilinkLabel}
      oninput={(e) => props.onWikilinkLabelChange((e.target as HTMLInputElement).value)}
      class="mb-4"
    />
    <div class="flex justify-end gap-2">
      <Button size="xs" color="primary" onclick={props.onWikilinkInsert}>Insert</Button>
      <Button size="xs" color="alternative" onclick={() => props.onCloseModal('wikilink')}>Cancel</Button>
    </div>
  </Modal>
{/if}

<!-- Link Modal -->
{#if props.showLinkModal}
  <Modal class="modal-leather" title="Insert Link" open={props.showLinkModal} autoclose outsideclose size="sm">
    <Input
      type="url"
      placeholder="URL (e.g. https://example.com)"
      value={props.linkUrl}
      oninput={(e) => props.onLinkUrlChange((e.target as HTMLInputElement).value)}
      class="mb-2"
    />
    <Input
      type="text"
      placeholder="Link text (optional)"
      value={props.linkText}
      oninput={(e) => props.onLinkTextChange((e.target as HTMLInputElement).value)}
      class="mb-4"
    />
    {#if props.linkUrl}
      <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h4 class="text-sm font-medium mb-2">Preview:</h4>
        <div class="text-sm">
          <a href={props.linkUrl} target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
            {props.linkText || props.linkUrl}
          </a>
        </div>
      </div>
    {/if}
    <div class="flex justify-end gap-2">
      <Button size="xs" color="primary" onclick={props.onLinkInsert}>Insert</Button>
      <Button size="xs" color="alternative" onclick={() => props.onCloseModal('link')}>Cancel</Button>
    </div>
  </Modal>
{/if}

<!-- Image Modal -->
{#if props.showImageModal}
  <Modal class="modal-leather" title="Insert Image" open={props.showImageModal} autoclose outsideclose size="md">
    <div class="space-y-4">
      <Input
        type="url"
        placeholder="Image URL (e.g. https://example.com/image.jpg)"
        value={props.imageUrl}
        oninput={(e) => props.onImageUrlChange((e.target as HTMLInputElement).value)}
        class="mb-2"
      />
      <Input
        type="text"
        placeholder="Alt text (optional)"
        value={props.imageAlt}
        oninput={(e) => props.onImageAltChange((e.target as HTMLInputElement).value)}
        class="mb-4"
      />
      
      {#if props.imageUrl}
        <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h4 class="text-sm font-medium mb-3 text-gray-900 dark:text-gray-100">Preview:</h4>
          <div class="relative">
            <div class="image-loading flex items-center justify-center h-32 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600">
              <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading image...
              </div>
            </div>
            
            <img 
              src={props.imageUrl} 
              alt={props.imageAlt || 'Preview'} 
              class="max-w-full h-auto max-h-64 rounded-lg border border-gray-300 dark:border-gray-600 hidden"
              crossorigin="anonymous"
              onerror={(e) => handleImageError(e.target as HTMLImageElement)}
              onload={(e) => handleImageLoad(e.target as HTMLImageElement)}
              onloadstart={(e) => setupImageTimeout(e.target as HTMLImageElement)}
            />
            
            <div class="image-error text-sm text-red-500 mt-2 hidden">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                </svg>
                Failed to load image. This may be due to CORS restrictions or the image being blocked.
              </div>
              <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <p>Common solutions:</p>
                <ul class="list-disc list-inside mt-1 space-y-1">
                  <li>Try a different image hosting service (e.g., imgur.com, postimages.org)</li>
                  <li>Use an image with HTTPS URL</li>
                  <li>Check if the image URL is publicly accessible</li>
                  <li>Try uploading to a CORS-enabled service like imgur.com</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
            <div class="flex items-center gap-2">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"></path>
              </svg>
              URL: <span class="font-mono text-xs break-all">{props.imageUrl}</span>
            </div>
            {#if props.imageAlt}
              <div class="flex items-center gap-2 mt-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                </svg>
                Alt text: <span class="font-mono text-xs">{props.imageAlt}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
      
      <div class="flex justify-end gap-2">
        <Button 
          size="xs" 
          color="primary" 
          onclick={props.onImageInsert}
          disabled={!props.imageUrl || props.imageUrl.trim() === ''}
        >
          Insert Image
        </Button>
        <Button size="xs" color="alternative" onclick={() => props.onCloseModal('image')}>Cancel</Button>
      </div>
    </div>
  </Modal>
{/if}

<!-- Table Modal -->
{#if props.showTableModal}
  <Modal class="modal-leather" title="Insert Table" open={props.showTableModal} autoclose outsideclose size="lg">
    <div class="space-y-4">
      <div class="flex justify-between items-center">
        <h4 class="text-sm font-medium">Headers:</h4>
        <Button size="xs" color="primary" onclick={props.onAddTableColumn}>Add Column</Button>
      </div>
      <div class="grid grid-cols-{props.tableData.headers.length || 2} gap-2">
        {#each props.tableData.headers as header, index}
          <Input
            type="text"
            placeholder="Header {index + 1}"
            value={props.tableData.headers[index]}
            oninput={(e) => props.onTableHeaderChange(index, (e.target as HTMLInputElement).value)}
            class="text-sm"
          />
        {/each}
      </div>
      
      <div class="flex justify-between items-center">
        <h4 class="text-sm font-medium">Rows:</h4>
        <Button size="xs" color="primary" onclick={props.onAddTableRow}>Add Row</Button>
      </div>
      {#each props.tableData.rows as row, rowIndex}
        <div class="flex items-center gap-2">
          <div class="grid grid-cols-{props.tableData.headers.length || 2} gap-2 flex-1">
            {#each row as cell, colIndex}
              <Input
                type="text"
                placeholder="Cell {rowIndex + 1}-{colIndex + 1}"
                value={props.tableData.rows[rowIndex][colIndex]}
                oninput={(e) => props.onTableCellChange(rowIndex, colIndex, (e.target as HTMLInputElement).value)}
                class="text-sm"
              />
            {/each}
          </div>
          <Button size="xs" color="red" onclick={() => props.onRemoveTableRow(rowIndex)}>×</Button>
        </div>
      {/each}
    </div>
    <div class="flex justify-end gap-2 mt-4">
      <Button size="xs" color="primary" onclick={props.onTableInsert}>Insert Table</Button>
      <Button size="xs" color="alternative" onclick={() => props.onCloseModal('table')}>Cancel</Button>
    </div>
  </Modal>
{/if}

<!-- Footnote Modal -->
{#if props.showFootnoteModal}
  <Modal class="modal-leather" title="Insert Footnote" open={props.showFootnoteModal} autoclose outsideclose size="sm">
    <Input
      type="text"
      placeholder="Footnote ID (e.g. note1)"
      value={props.footnoteId}
      oninput={(e) => props.onFootnoteIdChange((e.target as HTMLInputElement).value)}
      class="mb-2"
    />
    <Input
      type="text"
      placeholder="Footnote text"
      value={props.footnoteText}
      oninput={(e) => props.onFootnoteTextChange((e.target as HTMLInputElement).value)}
      class="mb-4"
    />
    <div class="flex justify-end gap-2">
      <Button size="xs" color="primary" onclick={props.onFootnoteInsert}>Insert Footnote</Button>
      <Button size="xs" color="alternative" onclick={() => props.onCloseModal('footnote')}>Cancel</Button>
    </div>
  </Modal>
{/if}

<!-- Heading Modal -->
{#if props.showHeadingModal}
  <Modal class="modal-leather" title="Insert Heading" open={props.showHeadingModal} autoclose outsideclose size="sm">
    <div class="mb-2">
      <label for="heading-level" class="block text-sm font-medium mb-1">Heading Level:</label>
      <select 
        id="heading-level" 
        value={props.headingLevel} 
        onchange={(e) => props.onHeadingLevelChange(parseInt((e.target as HTMLSelectElement).value))}
        class="w-full p-2 border border-gray-300 rounded-lg"
      >
        <option value={1}>H1 (# Heading)</option>
        <option value={2}>H2 (## Heading)</option>
        <option value={3}>H3 (### Heading)</option>
        <option value={4}>H4 (#### Heading)</option>
        <option value={5}>H5 (##### Heading)</option>
        <option value={6}>H6 (###### Heading)</option>
      </select>
    </div>
    <Input
      type="text"
      placeholder="Heading text"
      value={props.headingText}
      oninput={(e) => props.onHeadingTextChange((e.target as HTMLInputElement).value)}
      class="mb-4"
    />
    <div class="flex justify-end gap-2">
      <Button size="xs" color="primary" onclick={props.onHeadingInsert}>Insert Heading</Button>
      <Button size="xs" color="alternative" onclick={() => props.onCloseModal('heading')}>Cancel</Button>
    </div>
  </Modal>
{/if}

<!-- Emoji Modal -->
{#if props.showEmojiModal}
  <Modal class="modal-leather" title="Insert Emoji" open={props.showEmojiModal} autoclose outsideclose size="sm">
    <div class="space-y-4">
      <div class="grid grid-cols-5 gap-2">
        {#each [
          { emoji: "❤️", name: "heart" }, { emoji: "🚀", name: "rocket" }, { emoji: "😊", name: "smile" },
          { emoji: "😂", name: "lol" }, { emoji: "🎉", name: "party" }, { emoji: "👍", name: "thumbs up" },
          { emoji: "👎", name: "thumbs down" }, { emoji: "🔥", name: "fire" }, { emoji: "💯", name: "100" },
          { emoji: "✨", name: "sparkles" }, { emoji: "🎯", name: "target" }, { emoji: "💡", name: "lightbulb" },
          { emoji: "📚", name: "books" }, { emoji: "🎨", name: "art" }, { emoji: "⚡", name: "lightning" },
          { emoji: "🌟", name: "star" }, { emoji: "💪", name: "muscle" }, { emoji: "🎵", name: "music" },
          { emoji: "🏆", name: "trophy" }, { emoji: "💎", name: "gem" }
        ] as emoji}
          <button
            type="button"
            class="w-12 h-12 flex items-center justify-center text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title={emoji.name}
            onclick={() => props.onEmojiSelect(emoji.emoji)}
          >
            {emoji.emoji}
          </button>
        {/each}
      </div>
    </div>
  </Modal>
{/if} 