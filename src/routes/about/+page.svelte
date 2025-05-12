<script lang="ts">
  import { Heading, Img, P, A } from "flowbite-svelte";

  // Get the git tag version from environment variables
  const appVersion = import.meta.env.APP_VERSION || "development";
  const isVersionKnown = appVersion !== "development";
</script>

<div class="about-container">
  <main class="about-main">
    <div class="about-header">
      <Heading tag="h1" class="heading-1 mb-2">About the Library of Alexandria</Heading>
      {#if isVersionKnown}
        <span class="about-version">Version: {appVersion}</span>
      {/if}
    </div>
    <Img src="/screenshots/old_books.jpg" alt="Alexandria icon" class="image-bordered" />

    <P class="text-secondary mb-3">
      Alexandria is a reader and writer for <A
        href="/publication?d=gitcitadel-project-documentation-curated-publications-specification-7-by-stella-v-1"
        class="link"
        >curated publications</A
      > (in Asciidoc), wiki pages (Asciidoc), and will eventually also support long-form
      articles (Markdown). It is produced by the <A
        href="/publication?d=gitcitadel-project-documentation-gitcitadel-project-1-by-stella-v-1"
        class="link"
        >GitCitadel project team</A
      >.
    </P>

    <P class="text-secondary mb-3">
      Please submit support issues on the <A
        href="https://gitcitadel.com/r/naddr1qvzqqqrhnypzquqjyy5zww7uq7hehemjt7juf0q0c9rgv6lv8r2yxcxuf0rvcx9eqy88wumn8ghj7mn0wvhxcmmv9uq3wamnwvaz7tmjv4kxz7fwdehhxarj9e3xzmny9uqsuamnwvaz7tmwdaejumr0dshsqzjpd3jhsctwv3exjcgtpg0n0/issues"
        target="_blank"
        class="link"
        >Alexandria repo page</A
      > and follow us on <A
        href="https://github.com/ShadowySupercode/gitcitadel"
        target="_blank"
        class="link"
        >GitHub</A
      > and <A 
        href="https://geyser.fund/project/gitcitadel" 
        target="_blank"
        class="link"
        >Geyserfund</A
      >.
    </P>

    <P class="text-secondary">
      We are easiest to contact over our Nostr address <A
        href="https://njump.me/nprofile1qqsggm4l0xs23qfjwnkfwf6fqcs66s3lz637gaxhl4nwd2vtle8rnfqprfmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdaks5zhueg"
        title="npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz"
        target="_blank"
        class="link"
        >npub1s3h…75wz</A
      >.
    </P>

    <Heading tag="h2" class="heading-2 mt-4 mb-2">Overview</Heading>

    <P class="text-secondary mb-4">
      Alexandria opens up to the <A href="./" class="link">landing page</A>, where the user
      can: login (top-right), select whether to only view the publications
      hosted on the <A 
        href="https://thecitadel.nostr1.com/" 
        target="_blank"
        class="link"
        >thecitadel document relay</A
      > or add in their own relays, and scroll/search the publications.
    </P>

    <div class="about-image-container">
      <Img
        src="/screenshots/LandingPage.png"
        alt="Landing page"
        class="about-image"
        width="400"
      />
      <Img
        src="/screenshots/YourRelays.png"
        alt="Relay selection"
        class="about-image"
        width="400"
      />
    </div>

    <P class="text-secondary mb-3">
      There is also the ability to view the publications as a diagram, if you
      click on "Visualize", and to publish an e-book or other document (coming
      soon).
    </P>

    <P class="text-secondary mb-3">
      If you click on a card, which represents a 30040 index event, the
      associated reading view opens to the publication. The app then pulls all
      of the content events (30041s and 30818s for wiki pages), in the order in
      which they are indexed, and displays them as a single document.
    </P>

    <P class="text-secondary mb-3">
      Each content section (30041 or 30818) is also a level in the table of
      contents, which can be accessed from the floating icon top-left in the
      reading view. This allows for navigation within the publication. (This
      functionality has been temporarily disabled.)
    </P>

    <div class="about-image-container">
      <Img
        src="/screenshots/ToC_icon.png"
        alt="ToC icon"
        class="about-image"
        width="400"
      />
      <Img
        src="/screenshots/TableOfContents.png"
        alt="Table of contents example"
        class="about-image"
        width="400"
      />
    </div>

    <Heading tag="h2" class="heading-2 mt-4 mb-2">Typical use cases</Heading>

    <Heading tag="h3" class="heading-3 mb-3">For e-books</Heading>

    <P class="text-secondary mb-3">
      The most common use for Alexandria is for e-books: both those users have
      written themselves and those uploaded to Nostr from other sources. The
      first minor version of the app, Gutenberg, is focused on displaying and
      producing these publications.
    </P>

    <P class="text-secondary mb-3">
      An example of a book is <A
        href="/publication?d=jane-eyre-an-autobiography-by-charlotte-bront%C3%AB-v-3rd-edition"
        class="link"
        >Jane Eyre</A
      >
    </P>

    <div class="image-container">
      <Img
        src="/screenshots/JaneEyre.png"
        alt="Jane Eyre, by Charlotte Brontë"
        class="about-image"
        width="400"
      />
    </div>

    <Heading tag="h3" class="heading-3 mb-3">For scientific papers</Heading>

    <P class="text-secondary mb-3">
      Alexandria will also display research papers with Asciimath and LaTeX
      embedding, and the normal advanced formatting options available for
      Asciidoc. In addition, we will be implementing special citation events,
      which will serve as an alternative or addition to the normal footnotes.
    </P>

    <P class="text-secondary mb-3">
      Correctly displaying such papers, integrating citations, and allowing them
      to be reviewed (with kind 1111 comments), and annotated (with highlights)
      by users, is the focus of the second minor version, Euler.
    </P>

    <P class="text-secondary mb-3">
      Euler will also pioneer the HTTP-based (rather than websocket-based)
      e-paper compatible version of the web app.
    </P>

    <P class="text-secondary mb-3">
      An example of a research paper is <A
        href="/publication?d=less-partnering-less-children-or-both-by-julia-hellstrand-v-1"
        class="link"
        >Less Partnering, Less Children, or Both?</A
      >
    </P>

    <div class="image-container">
      <Img
        src="/screenshots/ResearchPaper.png"
        alt="Research paper"
        class="about-image"
        width="400"
      />
    </div>

    <Heading tag="h3" class="heading-3 mb-3">For documentation</Heading>

    <P class="text-secondary mb-3">
      Our own team uses Alexandria to document the app, to display our <A
        href="/publication?d=the-gitcitadel-blog-by-stella-v-1"
        class="link"
        >blog entries</A
      >, as well as to store copies of our most interesting <A
        href="/publication?d=gitcitadel-project-documentation-by-stella-v-1"
        class="link"
        >technical specifications</A
      >.
    </P>

    <div class="image-container">
      <Img
        src="/screenshots/Documentation.png"
        alt="Documentation"
        class="about-image"
        width="400"
      />
    </div>

    <Heading tag="h3" class="heading-3 mb-3">For wiki pages</Heading>

    <P class="text-secondary mb-3">
      Alexandria now supports wiki pages (kind 30818), allowing for
      collaborative knowledge bases and documentation. Wiki pages, such as this
      one about the <A 
        href="/publication?d=sybil"
        class="link"
        >Sybil utility</A> use the same
      Asciidoc format as other publications but are specifically designed for interconnected,
      evolving content.
    </P>

    <P class="text-secondary mb-3">
      Wiki pages can be linked to from other publications and can contain links
      to other wiki pages, creating a web of knowledge that can be navigated and
      explored.
    </P>
  </main>
</div>
