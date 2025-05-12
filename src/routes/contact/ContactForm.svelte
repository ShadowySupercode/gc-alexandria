<script lang='ts'>
  import { P, Button, Label, Textarea, Input } from 'flowbite-svelte';
  import { parseAdvancedMarkdown } from '$lib/utils/markdown/advancedMarkdownParser';
  import { createEventDispatcher } from 'svelte';

  // Props for initial state
  export let initialSubject = '';
  export let initialContent = '';

  // State
  let subject = initialSubject;
  let content = initialContent;
  let isSubmitting = false;
  let isExpanded = false;
  let activeTab = 'write';
  let submissionError = '';

  const dispatch = createEventDispatcher();

  function clearForm() {
    subject = '';
    content = '';
    submissionError = '';
    isExpanded = false;
    activeTab = 'write';
  }

  function toggleSize() {
    isExpanded = !isExpanded;
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!subject || !content) {
      submissionError = 'Please fill in all fields';
      return;
    }
    dispatch('submit', { subject, content });
  }
</script>

<form class="contact-form" onsubmit={handleSubmit}>
  <div>
    <Label for="subject" class="mb-2">Subject</Label>
    <Input id="subject" class="contact-form-input" placeholder="Issue subject" bind:value={subject} required autofocus />
  </div>
  <div class="relative">
    <Label for="content" class="mb-2">Description</Label>
    <div class="contact-form-textarea-container {isExpanded ? 'expanded' : 'collapsed'}">
      <div class="h-full flex flex-col">
        <div class="border-b border-gray-300 dark:border-gray-600">
          <ul class="contact-form-tabs" role="tablist">
            <li class="mr-2" role="presentation">
              <button 
                type="button"
                class="contact-form-tab {activeTab === 'write' ? 'active' : 'inactive'}" 
                onclick={() => activeTab = 'write'}
                role="tab"
              >
                Write
              </button>
            </li>
            <li role="presentation">
              <button 
                type="button"
                class="contact-form-tab {activeTab === 'preview' ? 'active' : 'inactive'}" 
                onclick={() => activeTab = 'preview'}
                role="tab"
              >
                Preview
              </button>
            </li>
          </ul>
        </div>
        <div class="flex-1 min-h-0 relative">
          {#if activeTab === 'write'}
            <div class="contact-form-tab-content">
              <Textarea 
                id="content" 
                class="contact-form-textarea"
                bind:value={content} 
                required 
                placeholder="Describe your issue in detail..."
              />
            </div>
          {:else}
            <div class="contact-form-preview">
              {#key content}
                {#await parseAdvancedMarkdown(content)}
                  <p>Loading preview...</p>
                {:then html}
                  {@html html || '<p class="text-gray-500">Nothing to preview</p>'}
                {:catch error}
                  <p class="text-red-500">Error rendering preview: {error.message}</p>
                {/await}
              {/key}
            </div>
          {/if}
        </div>
      </div>
      <Button
        type="button"
        size="xs"
        class="contact-form-toggle"
        color="light"
        onclick={toggleSize}
      >
        {isExpanded ? '⌃' : '⌄'}
      </Button>
    </div>
  </div>
  <div class="contact-form-actions">
    <Button type="button" color="alternative" onclick={clearForm}>
      Clear Form
    </Button>
    <Button type="submit" tabindex={0}>
      Submit Issue
    </Button>
  </div>
  {#if submissionError}
    <div class="contact-form-error" role="alert">
      {submissionError}
    </div>
  {/if}
</form> 