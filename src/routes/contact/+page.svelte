<script lang='ts'>
  import { Heading, Img, P, A, Button, Label, Textarea, Input } from "flowbite-svelte";
  import { ndkSignedIn, ndkInstance, activePubkey } from '$lib/ndk';
  import { standardRelays } from '$lib/consts';
  import { onMount } from 'svelte';
  import NDK, { NDKEvent, NDKRelay, NDKRelaySet } from '@nostr-dev-kit/ndk';
  // @ts-ignore - Workaround for Svelte component import issue
  import LoginModal from '$lib/components/LoginModal.svelte';
  import { parseMarkdown } from '$lib/utils/markdownParser';
  import { nip19 } from 'nostr-tools';
  
  // Function to close the success message
  function closeSuccessMessage() {
    submissionSuccess = false;
    submittedEvent = null;
  }
  
  let subject = '';
  let content = '';
  let isSubmitting = false;
  let showLoginModal = false;
  let submissionSuccess = false;
  let submissionError = '';
  let submittedEvent: NDKEvent | null = null;
  let issueLink = '';
  let successfulRelays: string[] = [];
  
  // Store form data when user needs to login
  let savedFormData = {
    subject: '',
    content: ''
  };
  
  // Repository event address from the task
  const repoAddress = 'naddr1qvzqqqrhnypzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqy88wumn8ghj7mn0wvhxcmmv9uqq5stvv4uxzmnywf5kz2elajr';
  
  // Hard-coded relays to ensure we have working relays
  const hardcodedRelays = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    ...standardRelays
  ];
  
  // Hard-coded repository owner pubkey and ID from the task
  // These values are extracted from the naddr
  const repoOwnerPubkey = 'fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1';
  const repoId = 'Alexandria';
  
  onMount(() => {
    console.log('Repository owner pubkey:', repoOwnerPubkey);
    console.log('Repository ID:', repoId);
  });
  
  // Function to normalize relay URLs by removing trailing slashes
  function normalizeRelayUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }
  
  async function handleSubmit() {
    if (!subject || !content) {
      submissionError = 'Please fill in all fields';
      return;
    }
    
    // Check if user is logged in
    if (!$ndkSignedIn) {
      // Save form data
      savedFormData = {
        subject,
        content
      };
      
      // Show login modal
      showLoginModal = true;
      return;
    }
    
    // User is logged in, proceed with submission
    await submitIssue();
  }
  
  async function submitIssue() {
    isSubmitting = true;
    submissionError = '';
    submissionSuccess = false;
    
    try {
      console.log('Starting issue submission...');
      
      // Get NDK instance
      const ndk = $ndkInstance;
      if (!ndk) {
        throw new Error('NDK instance not available');
      }
      
      if (!ndk.signer) {
        throw new Error('No signer available. Make sure you are logged in.');
      }
      
      console.log('NDK instance available with signer');
      console.log('Active pubkey:', $activePubkey);
      
      // Log the repository reference values
      console.log('Using repository reference values:', { repoOwnerPubkey, repoId });
      
      // Create a new NDK event
      const event = new NDKEvent(ndk);
      event.kind = 1621; // issue_kind
      event.tags.push(['subject', subject]);
      event.tags.push(['alt', `git repository issue: ${subject}`]);
      
      // Add repository reference with proper format
      const aTagValue = `30617:${repoOwnerPubkey}:${repoId}`;
      console.log('Adding a tag with value:', aTagValue);
      event.tags.push([
        'a',
        aTagValue,
        '',
        'root'
      ]);
      
      // Add repository owner as p tag with proper value
      console.log('Adding p tag with value:', repoOwnerPubkey);
      event.tags.push(['p', repoOwnerPubkey]);
      
      // Set content
      event.content = content;
      
      console.log('Created NDK event:', event);
      
      // Sign the event
      console.log('Signing event...');
      try {
        await event.sign();
        console.log('Event signed successfully');
      } catch (error) {
        console.error('Failed to sign event:', error);
        throw new Error('Failed to sign event');
      }
      
      // Collect all unique relays
      const uniqueRelays = new Set([
        ...hardcodedRelays.map(normalizeRelayUrl),
        ...standardRelays.map(normalizeRelayUrl),
        ...(ndk.pool ? Array.from(ndk.pool.relays.values())
          .filter(relay => relay.url && !relay.url.includes('wss://nos.lol'))
          .map(relay => normalizeRelayUrl(relay.url)) : [])
      ]);
      
      console.log('Publishing to relays:', Array.from(uniqueRelays));
      
      try {
        // Create NDK relay set
        const relaySet = NDKRelaySet.fromRelayUrls(Array.from(uniqueRelays), ndk);
        
        // Track successful relays
        successfulRelays = [];
        
        // Set up listeners for successful publishes
        const publishPromises = Array.from(uniqueRelays).map(relayUrl => {
          return new Promise<void>(resolve => {
            const relay = ndk.pool?.getRelay(relayUrl);
            if (relay) {
              relay.on('published', (publishedEvent: NDKEvent) => {
                if (publishedEvent.id === event.id) {
                  console.log(`Event published to relay: ${relayUrl}`);
                  successfulRelays = [...successfulRelays, relayUrl];
                  resolve();
                }
              });
            } else {
              resolve(); // Resolve if relay not available
            }
          });
        });

        // Start publishing with timeout
        const publishPromise = event.publish(relaySet);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Publish timeout')), 10000);
        });

        try {
          await Promise.race([
            publishPromise,
            Promise.allSettled(publishPromises),
            timeoutPromise
          ]);
          
          console.log('Event published successfully to', successfulRelays.length, 'relays');
          
          if (successfulRelays.length === 0) {
            console.warn('Event published but no relay confirmations received');
          }
        } catch (error) {
          if (successfulRelays.length > 0) {
            console.warn('Partial publish success:', error);
          } else {
            throw new Error('Failed to publish to any relays');
          }
        }

        // Store the submitted event and create issue link
        submittedEvent = event;
        
        // Create the issue link using the repository address
        const noteId = nip19.noteEncode(event.id);
        issueLink = `https://gitcitadel.com/r/${repoAddress}/issues/${noteId}`;
        
        // Reset form and show success message
        subject = '';
        content = '';
        submissionSuccess = true;
      } catch (error) {
        console.error('Failed to publish event:', error);
        throw new Error('Failed to publish event');
      }
    } catch (error: any) {
      console.error('Error submitting issue:', error);
      submissionError = `Error submitting issue: ${error.message || 'Unknown error'}`;
    } finally {
      isSubmitting = false;
    }
  }
  
  // Handle login completion
  $: if ($ndkSignedIn && showLoginModal) {
    showLoginModal = false;
    
    // Restore saved form data
    if (savedFormData.subject) subject = savedFormData.subject;
    if (savedFormData.content) content = savedFormData.content;
    
    // Submit the issue
    submitIssue();
  }
</script>

<div class='w-full flex justify-center'>
  <main class='main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4'>
    <Heading tag='h1' class='h-leather mb-2'>Contact GitCitadel</Heading>
    
    <P class="mb-3">
    Make sure that you follow us on <A href="https://github.com/ShadowySupercode/gitcitadel" target="_blank">GitHub</A> and <A href="https://geyser.fund/project/gitcitadel" target="_blank">Geyserfund</A>.
    </P>

    <P class="mb-3">
    You can contact us on Nostr <A href="https://njump.me/nprofile1qqsggm4l0xs23qfjwnkfwf6fqcs66s3lz637gaxhl4nwd2vtle8rnfqprfmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdaks5zhueg" title="npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz" target="_blank">npub1s3h…75wz</A> or you can view submitted issues on the <A href="https://gitcitadel.com/r/naddr1qvzqqqrhnypzquqjyy5zww7uq7hehemjt7juf0q0c9rgv6lv8r2yxcxuf0rvcx9eqy88wumn8ghj7mn0wvhxcmmv9uq3wamnwvaz7tmjv4kxz7fwdehhxarj9e3xzmny9uqsuamnwvaz7tmwdaejumr0dshsqzjpd3jhsctwv3exjcgtpg0n0/issues" target="_blank">Alexandria repo page.</A>
    </P>
    
    <Heading tag='h2' class='h-leather mt-4 mb-2'>Submit an issue</Heading>
    
    <P class="mb-3">
      If you are logged into the Alexandria web application (using the button at the top-right of the window), then you can use the form, below, to submit an issue, that will appear on our repo page.
    </P>

    <form class="space-y-4 mt-6" on:submit|preventDefault={handleSubmit}>
      <div>
        <Label for="subject" class="mb-2">Subject</Label>
        <Input id="subject" placeholder="Issue subject" bind:value={subject} required />
      </div>
      
      <div>
        <Label for="content" class="mb-2">Description</Label>
        <Textarea id="content" placeholder="Describe your issue in detail... (Markdown supported)" rows={12} bind:value={content} required />
      </div>
      
      <div class="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {#if isSubmitting}
            Submitting...
          {:else}
            Submit Issue
          {/if}
        </Button>
      </div>
      
      {#if submissionSuccess && submittedEvent}
        <div class="p-6 mb-4 text-sm bg-success-200 dark:bg-success-700 border border-success-300 dark:border-success-600 rounded-lg relative" role="alert">
          <!-- Close button -->
          <button 
            class="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100"
            on:click={closeSuccessMessage}
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
          
          <div class="flex items-center mb-3">
            <svg class="w-5 h-5 mr-2 text-success-700 dark:text-success-300" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <span class="font-medium text-success-800 dark:text-success-200">Issue submitted successfully!</span>
          </div>
          
          <div class="mb-3 p-3 bg-white dark:bg-gray-800 rounded border border-success-200 dark:border-success-600">
            <div class="mb-2">
              <span class="font-semibold">Subject:</span> 
              <span>{submittedEvent.tags.find(t => t[0] === 'subject')?.[1] || 'No subject'}</span>
            </div>
            <div>
              <span class="font-semibold">Description:</span>
              <div class="mt-1 note-leather">
                {#await parseMarkdown(submittedEvent.content)}
                  <p>Loading...</p>
                {:then html}
                  {@html html}
                {:catch error}
                  <p class="text-red-500">Error rendering markdown: {error.message}</p>
                {/await}
              </div>
            </div>
          </div>
          
          <div class="mb-3">
            <span class="font-semibold">View your issue:</span>
            <div class="mt-1">
              <A href={issueLink} target="_blank" class="text-blue-600 hover:underline break-all">
                {issueLink}
              </A>
            </div>
          </div>
          
          <!-- Display successful relays -->
          <div class="text-sm">
            <span class="font-semibold">Successfully published to relays:</span>
            <ul class="list-disc list-inside mt-1">
              {#each successfulRelays as relay}
                <li class="text-success-700 dark:text-success-300">{relay}</li>
              {/each}
            </ul>
          </div>
        </div>
      {/if}
      
      {#if submissionError}
        <div class="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
          {submissionError}
        </div>
      {/if}
    </form>
    
    </main>
</div>

<!-- Login Modal -->
<LoginModal 
  show={showLoginModal} 
  onClose={() => showLoginModal = false} 
/>

<style>
  :global(.footnote-ref) {
    text-decoration: none;
    color: var(--color-primary);
  }

  :global(.footnotes) {
    margin-top: 2rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  :global(.footnotes hr) {
    margin: 1rem 0;
    border-top: 1px solid var(--color-border);
  }

  :global(.footnotes ol) {
    padding-left: 1rem;
  }

  :global(.footnotes li) {
    margin-bottom: 0.5rem;
  }

  :global(.footnote-backref) {
    text-decoration: none;
    margin-left: 0.5rem;
    color: var(--color-primary);
  }

  :global(.note-leather) :global(.footnote-ref),
  :global(.note-leather) :global(.footnote-backref) {
    color: var(--color-leather-primary);
  }
</style>
