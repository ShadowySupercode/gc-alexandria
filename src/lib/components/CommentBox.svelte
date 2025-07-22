<script lang="ts">
  import { Button, Alert } from "flowbite-svelte";
  import CommentBoxModals from "./CommentBoxModals.svelte";
  import { nip19 } from "nostr-tools";
  import { toNpub, getUserMetadata } from "$lib/utils/nostrUtils";
  import { searchService } from "$lib/services/searchService";
  import type { NostrProfile } from "$lib/utils/search_utility";
  import { userPubkey } from "$lib/stores/authStore.Svelte";
  import type { NDKEvent } from "$lib/utils/nostrUtils";
  import {
    extractRootEventInfo,
    extractParentEventInfo,
    buildReplyTags,
    createSignedEvent,
    publishEvent,
  } from "$lib/utils/nostrEventService";
  import { goto } from "$app/navigation";
  import { activeInboxRelays, activeOutboxRelays } from "$lib/ndk";
  import { createEditorUtils } from "$lib/utils/editor_utils";
  import { createModalState, type ModalState } from "$lib/composables/modalState.svelte";
  import { createSubmissionHandler } from "$lib/composables/submissionHandler";

  // Component props
  const props = $props<{
    placeholder?: string;
    initialContent?: string;
    showToolbar?: boolean;
    minHeight?: string;
    event?: NDKEvent;
    userRelayPreference?: boolean;
    kind?: number;
    tags?: string[][];
    onSubmit?: (content: string) => Promise<{ success: boolean; error?: string; eventId?: string }>;
    submitButtonText?: string;
    showUserProfile?: boolean;
    showMentions?: boolean;
    showWikilinks?: boolean;
  }>();

  // Default values
  const {
    placeholder = "Write your comment...",
    initialContent = "",
    showToolbar = true,
    minHeight = "200px",
    event,
    userRelayPreference = false,
    kind,
    tags = [],
    onSubmit,
    submitButtonText = "Post Comment",
    showUserProfile = true,
    showMentions = true,
    showWikilinks = true,
  } = props;

  // Core state
  let content = $state(initialContent);
  let isSubmitting = $state(false);
  let success = $state<{ relay: string; eventId: string } | null>(null);
  let error = $state<string | null>(null);
  let userProfile = $state<NostrProfile | null>(null);

  // Editor state
  let editorRef = $state<HTMLDivElement | undefined>(undefined);
  let showMarkup = $state(false);
  let markupText = $state("");

  // Create composables
  const { modalState, communityStatus, openModal, closeModal } = createModalState();
  const { handleSubmit, handleViewComment } = createSubmissionHandler({
    content: () => content,
    event,
    kind,
    tags,
    onSubmit,
    userRelayPreference,
    onSuccess: (result: { relay: string; eventId: string }) => {
      success = result;
      clearForm();
    },
    onError: (errorMessage: string) => {
      error = errorMessage;
    },
    onSubmitting: (submitting: boolean) => {
      isSubmitting = submitting;
    }
  });

  // Create editor utilities
  const editorUtils = createEditorUtils({
    editorRef: () => editorRef,
    content: () => content,
    setContent: (newContent: string) => { content = newContent; },
    showMarkup: () => showMarkup,
    markupText: () => markupText,
    setMarkupText: (newMarkup: string) => { markupText = newMarkup; },
  });

  // Effects
  $effect(() => {
    const trimmedPubkey = $userPubkey?.trim();
    const npub = toNpub(trimmedPubkey);
    if (npub) {
      getUserMetadata(npub).then((metadata) => {
        userProfile = metadata;
      });
    } else if (trimmedPubkey) {
      userProfile = null;
      error = "Invalid public key: must be a 64-character hex string.";
    } else {
      userProfile = null;
      error = null;
    }
  });

  $effect(() => {
    if (!success) return;
    content = "";
  });

  $effect(() => {
    if (showMarkup) {
      // Apply highlighting when switching to markup mode
      setTimeout(() => {
        editorUtils.updateMarkupHighlighting();
      }, 100);
    }
  });

  $effect(() => {
    if (showMarkup && markupText) {
      // Apply highlighting when markup text changes
      setTimeout(() => {
        editorUtils.updateMarkupHighlighting();
      }, 50);
    }
  });

  // Reactive search effect
  $effect(() => {
    const searchTerm = modalState.mention.search.trim();
    
    if (!searchTerm || searchTerm.length < 2) {
      modalState.mention.results = [];
      Object.assign(communityStatus, {});
      return;
    }

    searchService.searchProfiles(
      searchTerm,
      (results) => {
        modalState.mention.results = results.profiles;
        Object.assign(communityStatus, results.communityStatus);
        modalState.mention.loading = results.isLoading;
      },
      (isLoading) => {
        modalState.mention.loading = isLoading;
      }
    );
  });

  // Helper functions
  function clearForm() {
    content = "";
    markupText = "";
    error = null;
    success = null;
    
    // Clear the editor if it exists
    if (editorRef) {
      editorRef.innerHTML = "";
    }
  }

  function shortenNpub(npub: string | undefined) {
    if (!npub) return "";
    return npub.slice(0, 8) + "…" + npub.slice(-4);
  }

  // Modal action handlers
  function selectMention(profile: NostrProfile) {
    let mention = "";
    if (profile.pubkey) {
      try {
        const npub = toNpub(profile.pubkey);
        mention = npub ? `nostr:${npub}` : `nostr:${profile.pubkey}`;
      } catch (e) {
        mention = `nostr:${profile.pubkey}`;
      }
    } else {
      mention = `@${profile.displayName || profile.name}`;
    }
    editorUtils.insertText(mention);
    closeModal('mention');
  }

  function insertWikilink() {
    const { target, label } = modalState.wikilink;
    const markup = label.trim() ? `[[${target}|${label}]]` : `[[${target}]]`;
    editorUtils.insertText(markup);
    closeModal('wikilink');
  }

  function insertLink() {
    const { url, text } = modalState.link;
    const markup = `[${text || 'link'}](${url})`;
    editorUtils.insertText(markup);
    closeModal('link');
  }

  function insertImage() {
    const { url, alt } = modalState.image;
    console.log('insertImage called with:', { url, alt });
    const markup = `![${alt || 'image'}](${url})`;
    console.log('Generated markup:', markup);
    editorUtils.insertText(markup);
    closeModal('image');
  }

  function insertTable() {
    const { data } = modalState.table;
    let tableMarkup = "";
    
    if (data.headers.length > 0) {
      tableMarkup += "| " + data.headers.join(" | ") + " |\n";
      tableMarkup += "| " + data.headers.map(() => "---").join(" | ") + " |\n";
    }
    
    data.rows.forEach(row => {
      tableMarkup += "| " + row.join(" | ") + " |\n";
    });
    
    editorUtils.insertText(tableMarkup);
    closeModal('table');
  }

  function insertFootnote() {
    const { id, text } = modalState.footnote;
    const markup = `[^${id}]`;
    const footnoteDef = `\n\n[^${id}]: ${text}`;
    editorUtils.insertText(markup + footnoteDef);
    closeModal('footnote');
  }

  function insertHeading() {
    const { level, text } = modalState.heading;
    const headingMarkup = "#".repeat(level) + " " + text;
    editorUtils.insertText(headingMarkup);
    closeModal('heading');
  }

  function insertHorizontalRule() {
    editorUtils.insertText("\n---\n");
  }

  // Table manipulation functions
  function addTableRow() {
    const newRow = new Array(modalState.table.data.headers.length || 2).fill("");
    modalState.table.data.rows = [...modalState.table.data.rows, newRow];
  }

  function removeTableRow(index: number) {
    modalState.table.data.rows = modalState.table.data.rows.filter((_, i) => i !== index);
  }

  function addTableColumn() {
    const newColIndex = modalState.table.data.headers.length;
    modalState.table.data.headers = [...modalState.table.data.headers, `Header ${newColIndex + 1}`];
    modalState.table.data.rows = modalState.table.data.rows.map(row => [...row, ""]);
  }

  function removeTableColumn(index: number) {
    modalState.table.data.headers = modalState.table.data.headers.filter((_, i) => i !== index);
    modalState.table.data.rows = modalState.table.data.rows.map(row => row.filter((_, i) => i !== index));
  }

  // Toolbar actions with proper icons
  const formattingActions = [
    { label: "Bold", icon: "B", action: () => editorUtils.applyFormatting('strong'), shortcut: "Ctrl+B", class: "font-bold" },
    { label: "Italic", icon: "I", action: () => editorUtils.applyFormatting('em'), shortcut: "Ctrl+I", class: "italic" },
    { label: "Strikethrough", icon: "S", action: () => editorUtils.applyFormatting('del'), class: "line-through" }
  ];

  const listActions = [
    { label: "Bullet List", icon: "•", action: () => editorUtils.insertListItem('bullet'), class: "list-disc" },
    { label: "Numbered List", icon: "1.", action: () => editorUtils.insertListItem('numbered'), class: "list-decimal" },
    { label: "Blockquote", icon: "☰", action: () => editorUtils.insertBlockquote(), class: "" }
  ];

  // Emoji data
  const emojis = [
    { emoji: "❤️", name: "heart" },
    { emoji: "🚀", name: "rocket" },
    { emoji: "😊", name: "smile" },
    { emoji: "😂", name: "lol" },
    { emoji: "🎉", name: "party" },
    { emoji: "👍", name: "thumbs up" },
    { emoji: "👎", name: "thumbs down" },
    { emoji: "🔥", name: "fire" },
    { emoji: "💯", name: "100" },
    { emoji: "✨", name: "sparkles" },
    { emoji: "🎯", name: "target" },
    { emoji: "💡", name: "lightbulb" },
    { emoji: "📚", name: "books" },
    { emoji: "🎨", name: "art" },
    { emoji: "⚡", name: "lightning" },
    { emoji: "🌟", name: "star" },
    { emoji: "💪", name: "muscle" },
    { emoji: "🎵", name: "music" },
    { emoji: "🏆", name: "trophy" },
    { emoji: "💎", name: "gem" }
  ];

  // Insert actions
  const insertActions = [
    { label: "Code", icon: "< >", action: () => editorUtils.applyCodeFormatting(), class: "font-mono" },
    { label: "Link", icon: "link", action: () => openModal('link'), class: "" },
    { label: "Image", icon: "img", action: () => openModal('image'), class: "text-xs" },
    { label: "Table", icon: "⊞", action: () => openModal('table'), class: "" },
    { label: "Footnote", icon: "*", action: () => openModal('footnote'), class: "" },
    { label: "Heading", icon: "H", action: () => openModal('heading'), class: "font-bold" },
    { label: "Horizontal Rule", icon: "—", action: () => insertHorizontalRule(), class: "" },
    { label: "LaTeX Inline", icon: "∑", action: () => editorUtils.insertLaTeX(), class: "" },
    { label: "LaTeX Display", icon: "∑∑", action: () => editorUtils.insertDisplayLaTeX(), class: "" },
    { label: "Emoji", icon: "😊", action: () => openModal('emoji'), class: "" },
    ...(showMentions ? [{ label: "Mention", icon: "@", action: () => openModal('mention'), class: "" }] : []),
    ...(showWikilinks ? [{ label: "Wikilink", icon: "[[", action: () => openModal('wikilink'), class: "" }] : [])
  ];

  function insertEmoji(emoji: string) {
    editorUtils.insertText(emoji);
    closeModal('emoji');
  }

  function toggleMarkup() {
    if (showMarkup) {
      // Switching from markup to WYSIWYG
      const html = editorUtils.convertMarkupToHtml(markupText);
      content = html;
      showMarkup = false;
      
      // Wait for editor to be available before setting innerHTML
      setTimeout(() => {
        if (editorRef) {
          editorRef.innerHTML = html;
        }
      }, 10);
    } else {
      // Switching from WYSIWYG to markup
      let cleanContent = content;
      
      // Clean up any empty divs or br tags that might cause issues
      if (cleanContent.includes('<div><br></div>')) {
        cleanContent = cleanContent.replace(/<div><br><\/div>/g, '');
      }
      
      markupText = editorUtils.convertHtmlToMarkup(cleanContent);
      showMarkup = true;
      
      // Apply highlighting after switching to markup mode
      setTimeout(() => {
        editorUtils.updateMarkupHighlighting();
      }, 100);
    }
  }

  function handleEditorInput() {
    if (!showMarkup) {
      editorUtils.updateContentFromEditor();
    }
  }

  function handleEditorKeydown(event: KeyboardEvent) {
    editorUtils.handleEditorKeydown(event);
  }

  function setEditorFocused(focused: boolean) {
    editorUtils.setEditorFocused(focused);
  }

  function handleViewCommentClick() {
    if (success?.eventId) {
      handleViewComment(success.eventId);
    }
  }

  function handleSubmitClick() {
    handleSubmit();
  }

  function handleMarkupKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const textarea = event.target as HTMLTextAreaElement;
      const cursorPos = textarea.selectionStart;
      const currentText = markupText;
      
      // Get the current line
      const lines = currentText.split('\n');
      let currentLineIndex = 0;
      let charCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length + 1 > cursorPos) {
          currentLineIndex = i;
          break;
        }
        charCount += lines[i].length + 1; // +1 for newline
      }
      
      const currentLine = lines[currentLineIndex];
      
      // Check if current line is a list item or blockquote
      const bulletMatch = currentLine.match(/^(\s*)(\*)\s/);
      const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
      const blockquoteMatch = currentLine.match(/^(\s*)(>)\s/);
      
      if (bulletMatch) {
        event.preventDefault();
        const indent = bulletMatch[1];
        const marker = bulletMatch[2];
        
        // Insert new bullet item
        const beforeCursor = currentText.substring(0, cursorPos);
        const afterCursor = currentText.substring(cursorPos);
        const newText = beforeCursor + '\n' + indent + marker + ' ' + afterCursor;
        
        markupText = newText;
        
        // Set cursor position after the new marker
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = cursorPos + 1 + indent.length + marker.length + 1; // +1 for '\n', +1 for ' '
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      } else if (numberedMatch) {
        event.preventDefault();
        const indent = numberedMatch[1];
        const number = parseInt(numberedMatch[2]);
        
        // Insert new numbered item
        const beforeCursor = currentText.substring(0, cursorPos);
        const afterCursor = currentText.substring(cursorPos);
        const newText = beforeCursor + '\n' + indent + (number + 1) + '. ' + afterCursor;
        
        markupText = newText;
        
        // Set cursor position after the new marker
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = cursorPos + 1 + indent.length + (number + 1).toString().length + 2; // +1 for '\n', +2 for '. '
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      } else if (blockquoteMatch) {
        event.preventDefault();
        const indent = blockquoteMatch[1];
        const marker = blockquoteMatch[2];
        
        // Insert new blockquote line
        const beforeCursor = currentText.substring(0, cursorPos);
        const afterCursor = currentText.substring(cursorPos);
        const newText = beforeCursor + '\n' + indent + marker + ' ' + afterCursor;
        
        markupText = newText;
        
        // Set cursor position after the new marker
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = cursorPos + 1 + indent.length + marker.length + 1; // +1 for '\n', +1 for ' '
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 10);
      }
    }
  }
</script>

<div class="w-full space-y-4">
  <!-- WYSIWYG Toolbar -->
  {#if showToolbar}
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
      <!-- Main toolbar -->
      <div class="flex items-center justify-between p-1 border-b border-gray-200 dark:border-gray-700 min-w-0">
        <div class="flex items-center space-x-0.5 flex-1 min-w-0 overflow-hidden">
          <!-- Text formatting -->
          <div class="flex items-center space-x-0.5 pr-1 border-r border-gray-300 dark:border-gray-600">
            {#each formattingActions as action}
              <button
                type="button"
                class="toolbar-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="{action.label} ({action.shortcut})"
                onclick={action.action}
              >
                <span class="text-sm {action.class}">{action.icon}</span>
              </button>
            {/each}
          </div>

          <!-- Lists -->
          <div class="flex items-center space-x-0.5 px-1 border-r border-gray-300 dark:border-gray-600">
            {#each listActions as action}
              <button
                type="button"
                class="toolbar-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title={action.label}
                onclick={action.action}
              >
                <span class="text-sm {action.class}">{action.icon}</span>
              </button>
            {/each}
          </div>

          <!-- Insert options -->
          <div class="flex items-center space-x-0.5 px-1 flex-wrap gap-0.5">
            {#each insertActions as action}
              <button
                type="button"
                class="toolbar-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title={action.label}
                onclick={action.action}
              >
                <span class="text-sm {action.class}">{action.icon}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Right side actions -->
        <div class="flex items-center space-x-0.5 flex-shrink-0">
          <button
            type="button"
            class="toolbar-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Remove Formatting"
            onclick={() => editorUtils.removeFormatting()}
          >
            <span class="text-sm italic underline relative">T<span class="absolute -bottom-1 -right-1 text-xs rotate-12">×</span></span>
          </button>
          <button
            type="button"
            class="toolbar-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Clear"
            onclick={clearForm}
          >
            <span class="text-sm font-medium">clear</span>
          </button>
          <div class="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
          <button
            type="button"
            class="toolbar-button text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            title="Show/Hide Markup"
            onclick={toggleMarkup}
          >
            <span class="text-sm font-bold">{showMarkup ? 'WYSIWYG' : 'M↑'}</span>
          </button>
        </div>
      </div>

      <!-- WYSIWYG Editor or Markup Editor -->
      <div class="relative" style="height: {minHeight};">
        {#if showMarkup}
          <!-- Markup Editor with Syntax Highlighting -->
          <div class="relative h-full markup-editor-container">
            <div
              class="absolute inset-0 w-full p-4 pointer-events-none font-mono text-sm overflow-hidden z-0"
              style="font-family: 'Courier New', monospace; line-height: 1.5;"
            >
              <div class="whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100" id="markup-highlight"></div>
            </div>
            <textarea
              bind:value={markupText}
              class="absolute inset-0 w-full p-4 bg-transparent focus:outline-none focus:ring-0 resize-none font-mono text-sm caret-gray-900 dark:caret-gray-100 z-10 text-gray-900 dark:text-gray-100"
              style="font-family: 'Courier New', monospace; line-height: 1.5;"
              placeholder={placeholder}
              oninput={(e) => {
                // Update highlighting when text changes
                setTimeout(() => {
                  editorUtils.updateMarkupHighlighting();
                }, 50);
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  handleMarkupKeydown(e);
                }
              }}
              onscroll={(e) => {
                const textarea = e.target as HTMLTextAreaElement;
                const highlightDiv = textarea.previousElementSibling?.querySelector('#markup-highlight') as HTMLDivElement;
                if (highlightDiv) {
                  highlightDiv.scrollTop = textarea.scrollTop;
                  highlightDiv.scrollLeft = textarea.scrollLeft;
                }
              }}
            ></textarea>
          </div>
        {:else}
          <!-- WYSIWYG Editor -->
          <div class="relative h-full">
            <div
              bind:this={editorRef}
              contenteditable="true"
              role="textbox"
              aria-multiline="true"
              tabindex="0"
              class="p-4 text-gray-900 dark:text-gray-100 bg-transparent focus:outline-none focus:ring-0 resize-none h-full overflow-y-auto"
              placeholder={placeholder}
              oninput={handleEditorInput}
              onfocus={() => setEditorFocused(true)}
              onblur={() => setEditorFocused(false)}
              onkeydown={handleEditorKeydown}
              data-placeholder={placeholder}
            ></div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Simple textarea without toolbar -->
    <div class="relative" style="height: {minHeight};">
      <div
        bind:this={editorRef}
        contenteditable="true"
        class="border border-gray-300 dark:border-gray-600 rounded-lg p-4 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none h-full overflow-y-auto"
        placeholder={placeholder}
        oninput={handleEditorInput}
        onfocus={() => setEditorFocused(true)}
        onblur={() => setEditorFocused(false)}
        data-placeholder={placeholder}
      ></div>
    </div>
  {/if}
</div>

<!-- Modals Component -->
<CommentBoxModals
  showMentionModal={modalState.mention.show}
  showWikilinkModal={modalState.wikilink.show}
  showImageModal={modalState.image.show}
  showLinkModal={modalState.link.show}
  showTableModal={modalState.table.show}
  showFootnoteModal={modalState.footnote.show}
  showHeadingModal={modalState.heading.show}
  showEmojiModal={modalState.emoji.show}
  mentionSearch={modalState.mention.search}
  mentionResults={modalState.mention.results}
  mentionLoading={modalState.mention.loading}
  wikilinkTarget={modalState.wikilink.target}
  wikilinkLabel={modalState.wikilink.label}
  imageUrl={modalState.image.url}
  imageAlt={modalState.image.alt}
  linkUrl={modalState.link.url}
  linkText={modalState.link.text}
  tableData={modalState.table.data}
  footnoteId={modalState.footnote.id}
  footnoteText={modalState.footnote.text}
  headingLevel={modalState.heading.level}
  headingText={modalState.heading.text}
  onMentionSelect={selectMention}
  onWikilinkInsert={insertWikilink}
  onImageInsert={insertImage}
  onLinkInsert={insertLink}
  onTableInsert={insertTable}
  onFootnoteInsert={insertFootnote}
  onHeadingInsert={insertHeading}
  onEmojiSelect={insertEmoji}
  onAddTableRow={addTableRow}
  onRemoveTableRow={removeTableRow}
  onAddTableColumn={addTableColumn}
  onRemoveTableColumn={removeTableColumn}
  communityStatus={communityStatus}
  onCloseModal={(modalName: string) => closeModal(modalName as keyof ModalState)}
  onImageUrlChange={(value: string) => { modalState.image.url = value; }}
  onImageAltChange={(value: string) => { modalState.image.alt = value; }}
  onMentionSearchChange={(value: string) => { modalState.mention.search = value; }}
  onWikilinkTargetChange={(value: string) => { modalState.wikilink.target = value; }}
  onWikilinkLabelChange={(value: string) => { modalState.wikilink.label = value; }}
  onLinkUrlChange={(value: string) => { modalState.link.url = value; }}
  onLinkTextChange={(value: string) => { modalState.link.text = value; }}
  onTableHeaderChange={(index: number, value: string) => { modalState.table.data.headers[index] = value; }}
  onTableCellChange={(rowIndex: number, colIndex: number, value: string) => { modalState.table.data.rows[rowIndex][colIndex] = value; }}
  onFootnoteIdChange={(value: string) => { modalState.footnote.id = value; }}
  onFootnoteTextChange={(value: string) => { modalState.footnote.text = value; }}
  onHeadingLevelChange={(value: number) => { modalState.heading.level = value; }}
  onHeadingTextChange={(value: string) => { modalState.heading.text = value; }}
/>

{#if error}
  <Alert color="red" dismissable>
    {error}
  </Alert>
{/if}

{#if success}
  <Alert color="green" dismissable>
    Comment published successfully to {success.relay}!<br />
    Event ID: <span class="font-mono">{success.eventId}</span>
    <button
      onclick={handleViewCommentClick}
      class="text-primary-600 dark:text-primary-500 hover:underline ml-2"
    >
      View your comment
    </button>
  </Alert>
{/if}

<div class="flex justify-end items-center gap-4 mt-4">
  {#if showUserProfile && userProfile}
    <div class="flex items-center gap-2 text-sm">
      {#if userProfile.picture}
        <img
          src={userProfile.picture}
          alt={userProfile.name || "Profile"}
          class="w-8 h-8 rounded-full"
          onerror={(e) => {
            const img = e.target as HTMLImageElement;
            img.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(img.alt)}`;
          }}
        />
      {/if}
      <span class="text-gray-900 dark:text-gray-100">
        {userProfile.displayName ||
          userProfile.name ||
          nip19.npubEncode($userPubkey || "").slice(0, 8) + "..."}
      </span>
    </div>
  {/if}
  <Button
    onclick={handleSubmitClick}
    disabled={isSubmitting || !content.trim() || !$userPubkey}
    class="w-full md:w-auto"
  >
    {#if !$userPubkey}
      Not Signed In
    {:else if isSubmitting}
      Publishing...
    {:else}
      {submitButtonText}
    {/if}
  </Button>
</div>

{#if !$userPubkey}
  <Alert color="yellow" class="mt-4">
    Please sign in to post comments. Your comments will be signed with your
    current account.
  </Alert>
{/if}

<style>
  /* WYSIWYG Editor Styles */
  [contenteditable="true"]:empty:before {
    content: attr(data-placeholder);
    color: #9ca3af;
    pointer-events: none;
  }

  [contenteditable="true"]:focus {
    outline: none;
  }

  /* Custom toolbar button styles */
  .toolbar-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .toolbar-button:hover {
    background-color: #f3f4f6;
  }



  /* Bold button - make it more bold */
  .toolbar-button .font-bold {
    font-weight: 900;
  }

  /* Italic button - make it more slanted */
  .toolbar-button .italic {
    font-style: italic;
    transform: skew(-10deg);
  }

  /* Strikethrough button - fix positioning */
  .toolbar-button .line-through {
    position: relative;
  }

  .toolbar-button .line-through::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 2px;
    background-color: currentColor;
    transform: translateY(-50%);
  }

  /* Code button styling */
  .toolbar-button .font-mono {
    font-family: 'Courier New', monospace;
    font-size: 0.75rem;
  }


  /* Ensure the highlighting div text is visible in both light and dark modes */
  /* Using :global() since the element is created dynamically */
  :global(#markup-highlight) {
    color: #111827; /* gray-900 for light mode */
    font-family: 'Courier New', monospace;
    font-size: 0.875rem; /* text-sm */
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  :global(.dark #markup-highlight) {
    color: #f9fafb; /* gray-50 for dark mode */
  }

  /* Markup highlighting styles - these are applied dynamically via JavaScript */
  /* Using :global() to prevent Svelte from removing these styles */
  :global(.markup-highlight) {
    color: #9ca3af !important; /* gray-400 - lighter for light mode */
  }

  :global(.dark .markup-highlight) {
    color: #6b7280 !important; /* gray-500 - darker for dark mode */
  }

  /* Ensure highlighting works in both light and dark modes */
  :global(#markup-highlight .markup-highlight) {
    color: #9ca3af !important; /* gray-400 - lighter for light mode */
  }

  :global(.dark #markup-highlight .markup-highlight) {
    color: #6b7280 !important; /* gray-500 - darker for dark mode */
  }

  /* Ensure perfect synchronization between textarea and highlight div */
  :global(.markup-editor-container) {
    position: relative;
  }

  :global(.markup-editor-container textarea) {
    font-family: 'Courier New', monospace;
    font-size: 0.875rem; /* text-sm */
    line-height: 1.5;
    padding: 1rem; /* p-4 */
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    caret-color: #111827; /* gray-900 for light mode */
  }

  :global(.dark .markup-editor-container textarea) {
    caret-color: #f9fafb; /* gray-50 for dark mode */
  }

</style>
