<script lang='ts'>
  import { Heading, Img, P, A, Button, Label, Textarea, Input } from "flowbite-svelte";
  import { ndkSignedIn, ndkInstance, activePubkey } from '$lib/ndk';
  import { standardRelays } from '$lib/consts';
  import { onMount } from 'svelte';
  import NDK, { NDKEvent, NDKRelay, NDKRelaySet } from '@nostr-dev-kit/ndk';
  import LoginModal from '$lib/components/LoginModal.svelte';
  
  let subject = '';
  let content = '';
  let isSubmitting = false;
  let showLoginModal = false;
  let submissionSuccess = false;
  let submissionError = '';
  
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
      
      // Collect relays to publish to
      let relays = [...hardcodedRelays];
      
      // Sign the event
      console.log('Signing event...');
      try {
        await event.sign();
        console.log('Event signed successfully');
      } catch (error) {
        console.error('Failed to sign event:', error);
        throw new Error('Failed to sign event');
      }
      
      // Publish the event
      console.log('Publishing to relays:', relays);
      try {
        const relaySet = NDKRelaySet.fromRelayUrls(relays, ndk);
        await event.publish(relaySet);
        console.log('Event published successfully');
        
        // Reset form and show success message
        subject = '';
        content = '';
        submissionSuccess = true;
        
        // Hide success message after 5 seconds
        setTimeout(() => {
          submissionSuccess = false;
        }, 5000);
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
        <Textarea id="content" placeholder="Describe your issue in detail..." rows={6} bind:value={content} required />
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
      
      {#if submissionSuccess}
        <div class="p-4 mb-4 text-sm text-green-700 bg-green-100 rounded-lg" role="alert">
          Issue submitted successfully!
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
