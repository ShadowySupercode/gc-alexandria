<script lang='ts'>
  import { Heading, Img, P, A, Li} from "flowbite-svelte";
  import NostrFeed from "$lib/components/util/NostrFeed.svelte";
  
  // Get the git tag version from environment variables
  const appVersion = import.meta.env.APP_VERSION || 'development';
  const isVersionKnown = appVersion !== 'development';
</script>

<style>
  /* Add scroll margin to headings to ensure they're visible when targeted by anchor links */
  :global([id]) {
    scroll-margin-top: 5rem;
  }
  
  /* Style for the targeted heading to make it more visible */
  :global(:target) {
    animation: highlight 2s ease;
  }
  
  @keyframes highlight {
    0% { background-color: rgba(179, 111, 34, 0.336); }
    100% { background-color: transparent; }
  }
</style>

<div class='w-full flex justify-center'>
  <main class='main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4'>
    <div class="flex justify-between items-center">
      <Heading tag='h1' class='h-leather mb-2'>About the Library of Alexandria</Heading>
      {#if isVersionKnown}
        <span class="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-nowrap">Version: {appVersion}</span>
      {/if}
    </div>
    <Img src="/screenshots/old_books.jpg" alt="Alexandria icon" />

    <P class="mb-3">
        Alexandria is a reader and writer for <A href="/publication?d=gitcitadel-project-documentation-curated-publications-specification-7-by-stella-v-1">curated publications</A> (in Asciidoc), wiki pages (Asciidoc), and will eventually also support long-form articles (Markdown). It is produced by the <A href="/publication?d=gitcitadel-project-documentation-gitcitadel-project-1-by-stella-v-1">GitCitadel project team</A>.
    </P>

    <div class="toc-container p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
      <Heading tag='h3' class='h-leather mb-3'>Contents</Heading>
      <div class="toc-list pl-4 border-l-2 border-gray-300 dark:border-gray-600">
        <div class="toc-item py-1">
          <A href="#product_overview" class="flex items-center hover:text-amber-700 dark:hover:text-amber-400">
            <span class="toc-number mr-2">1.</span>
            <span class="toc-text">About the Product</span>
          </A>
        </div>
        <div class="toc-item py-1">
          <A href="#gitcitadel_feed" class="flex items-center hover:text-amber-700 dark:hover:text-amber-400">
            <span class="toc-number mr-2">2.</span>
            <span class="toc-text">Our Microblogging Feed</span>
          </A>
        </div>
        <div class="toc-item py-1">
          <A href="/publication?d=the-gitcitadel-blog-by-stella-v-1" target="_blank" class="flex items-center hover:text-amber-700 dark:hover:text-amber-400">
            <span class="toc-number mr-2">3.</span>
            <span class="toc-text">The Blog</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="External link">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </A>
        </div>
        <div class="toc-item py-1">
          <A href="/publication?d=gitcitadel-project-documentation-by-stella-v-1" target="_blank" class="flex items-center hover:text-amber-700 dark:hover:text-amber-400">
            <span class="toc-number mr-2">4.</span>
            <span class="toc-text">Technical Documentation</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="External link">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </A>
        </div>
      </div>
    </div>

    <Heading tag='h2' class='h-leather mt-4 mb-2' id="product_overview">Product Overview</Heading>
    
    <P class="mb-3">
      There is also the ability to view the publications as a diagram, if you click on "Visualize", and to publish an e-book or other document (coming soon).
    </P>

    <P class="mb-3">
      If you click on a card, which represents a 30040 index event, the associated reading view opens to the publication. The app then pulls all of the content events (30041s and 30818s for wiki pages), in the order in which they are indexed, and displays them as a single document.
    </P>
    
    <P class="mb-3">
      Each content section (30041 or 30818) is also a level in the table of contents, which can be accessed from the floating icon top-left in the reading view. This allows for navigation within the publication. (This functionality has been temporarily disabled.)
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img src="/screenshots/ToC_icon.png" alt="ToC icon" class='image-border rounded-lg' width="400" />
      <Img src="/screenshots/TableOfContents.png" alt="Table of contents example" class='image-border rounded-lg' width="400" />
    </div>
  
    <Heading tag='h2' class='h-leather mt-4 mb-2'>Typical use cases</Heading>

    <Heading tag='h3' class='h-leather mb-3'>For e-books</Heading>
    
    <P class="mb-3">
      The most common use for Alexandria is for e-books: both those users have written themselves and those uploaded to Nostr from other sources. The first minor version of the app, Gutenberg, is focused on displaying and producing these publications.
    </P>

    <P class="mb-3">
      An example of a book is <A href="/publication?d=jane-eyre-an-autobiography-by-charlotte-bront%C3%AB-v-3rd-edition">Jane Eyre</A>
    </P>

    <div class="flex justify-center my-4">
      <Img src="/screenshots/JaneEyre.png" alt="Jane Eyre, by Charlotte Brontë" class='image-border rounded-lg' width="400" />
    </div>
  
    <Heading tag='h3' class='h-leather mb-3'>For scientific papers</Heading>

    <P class="mb-3">
      Alexandria will also display research papers with Asciimath and LaTeX embedding, and the normal advanced formatting options available for Asciidoc. In addition, we will be implementing special citation events, which will serve as an alternative or addition to the normal footnotes.
    </P>

    <P class="mb-3">
      Correctly displaying such papers, integrating citations, and allowing them to be reviewed (with kind 1111 comments), and annotated (with highlights) by users, is the focus of the second minor version, Euler.
    </P>

    <P class="mb-3">
      Euler will also pioneer the HTTP-based (rather than websocket-based) e-paper compatible version of the web app.
    </P>

    <P class="mb-3">
      An example of a research paper is <A href="/publication?d=less-partnering-less-children-or-both-by-j.i.s.-hellstrand-v-1">Less Partnering, Less Children, or Both?</A>
    </P>

    <div class="flex justify-center my-4">
      <Img src="/screenshots/ResearchPaper.png" alt="Research paper" class='image-border rounded-lg' width="400" />
    </div>
  
    <Heading tag='h3' class='h-leather mb-3'>For documentation</Heading>

    <P class="mb-3">
      Our own team uses Alexandria to document the app, to display our <A href="/publication?d=the-gitcitadel-blog-by-stella-v-1">blog entries</A>, as well as to store copies of our most interesting <A href="/publication?d=gitcitadel-project-documentation-by-stella-v-1">technical specifications</A>.
    </P>

    <div class="flex justify-center my-4">
      <Img src="/screenshots/Documentation.png" alt="Documentation" class='image-border rounded-lg' width="400" />
    </div>
    
    <Heading tag='h3' class='h-leather mb-3'>For wiki pages</Heading>

    <P class="mb-3">
      Alexandria now supports wiki pages (kind 30818), allowing for collaborative knowledge bases and documentation. Wiki pages use the same Asciidoc format as other publications but are specifically designed for interconnected, evolving content.
    </P>

    <P class="mb-3">
      Wiki pages can be linked to from other publications and can contain links to other wiki pages, creating a web of knowledge that can be navigated and explored.
    </P>

    <Heading tag='h2' class='h-leather mt-4 mb-2' id="gitcitadel_feed">GitCitadel Feed</Heading>
  
    <P class="mb-4">
      Here is the kind 01 "microblogging" feed from the GitCitadel team:
    </P>

    <NostrFeed 
      pubkey="846ebf79a0a8813274ec9727490621ad423f16a3e474d7fd66e6a98bfe4e39a4"
      relayUrl="wss://theforest.nostr1.com"
      limit={20}
    />
      
  </main>
</div>
