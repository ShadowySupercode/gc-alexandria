<script lang="ts">
  import { Heading, Img, P, A } from "flowbite-svelte";
  import { goto } from "$app/navigation";

  // Get the git tag version from environment variables
  const appVersion = import.meta.env.APP_VERSION || "development";
  const isVersionKnown = appVersion !== "development";
</script>

<div class="w-full max-w-3xl flex flex-col self-center mb-3 px-2">
    <Heading tag="h1" class="h-leather mb-2"
      >Getting Started with Alexandria</Heading
    >

    <Heading tag="h2" class="h-leather mt-4 mb-2">Overview</Heading>

    <P class="mb-4">
      Alexandria opens up to the <button
        class="underline text-primary-700 bg-transparent border-none p-0"
        onclick={() => goto("./")}>landing page</button
      >, where the user can see the publications found on their own relays and the app's default relays.
      The user can also search the publications by title, author, or content.
      The relays can be viewed on the <button
      class="underline text-primary-700 bg-transparent border-none p-0"
      onclick={() => goto("/about/relay-stats")}>Relay Status</button> page.
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img
        src="/screenshots/LandingPage.png"
        alt="Landing page"
        class="image-border rounded-lg"
        width="400"
      />
    </div>   

    <P class="mb-3">
      If you click on a card, which represents a 30040 index event, the
      associated reading view opens to the publication. The app then pulls all
      of the content events (30041s and 30818s for wiki pages), in the order in
      which they are indexed, and displays them as a single document.
    </P>

    <P class="mb-3">
      Each content section (30041 or 30818) is also a level in the table of
      contents, which can be accessed from the floating icon top-left in the
      reading view. This allows for navigation within the publication.
      Publications of type "blog" have a ToC which emphasizes that each entry is
      a blog post.
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img
        src="/screenshots/ToC_normal.png"
        alt="ToC basic"
        class="image-border rounded-lg"
        width="400"
      />
      <Img
        src="/screenshots/ToC_blog.png"
        alt="ToC blog"
        class="image-border rounded-lg"
        width="400"
      />
    </div>


    <P class="mb-3">
      There is the ability to view and navigate the publications as a diagram, if you
      click on <button
        class="underline text-primary-700 bg-transparent border-none p-0"
        onclick={() => goto("/visualize")}>Visualize</button>.
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img
        src="/screenshots/Visualization.png"
        alt="Visualization page"
        class="image-border rounded-lg"
        width="400"
      />
    </div> 

    <Heading tag="h2" class="h-leather mt-4 mb-2">Typical use cases</Heading>

    <Heading tag="h3" class="h-leather mb-3">For e-books</Heading>

    <P class="mb-3">
      The most common use for Alexandria is for e-books: both those the users
      have written themselves and those uploaded to Nostr from other sources.
      The first minor version of the app, Gutenberg, is focused on displaying
      and producing these publications.
    </P>

    <P class="mb-3">
      An example of a book is <a
        href="/publication/d/jane-eyre-an-autobiography-by-charlotte-bront%C3%AB-v-3rd-edition"
        >Jane Eyre</a
      >
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img
        src="/screenshots/JaneEyre.png"
        alt="Jane Eyre, by Charlotte Brontë"
        class="image-border rounded-lg"
        width="400"
      />
    </div>

    <Heading tag="h3" class="h-leather mb-3">For scientific papers</Heading>

    <P class="mb-3">
      Alexandria displays research papers with Asciimath and LaTeX
      embedding, and the normal advanced formatting options available for
      Asciidoc. In addition, we will be implementing special citation events,
      which will serve as an alternative or addition to the normal footnotes.
    </P>

    <P class="mb-3">
      An example of a research paper is <a
        href="/publication/d/less-partnering-less-children-or-both-by-julia-hellstrand-v-1"
        >Less Partnering, Less Children, or Both?</a
      >
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img
        src="/screenshots/ResearchPaper.png"
        alt="Research paper"
        class="image-border rounded-lg"
        width="400"
      />
    </div>

    <Heading tag="h3" class="h-leather mb-3">For documentation</Heading>

    <P class="mb-3">
      Our own team uses Alexandria to document the app, to display our <a
        href="/publication/d/the-gitcitadel-blog-by-stella-v-1">blog entries</a
      >, as well as to store copies of our most interesting
      <a href="/publication/d/gitcitadel-project-documentation-by-stella-v-1"
        >technical specifications</a
      >.
    </P>

    <div class="flex flex-col items-center space-y-4 my-4">
      <Img
        src="/screenshots/Documentation.png"
        alt="Documentation"
        class="image-border rounded-lg"
        width="400"
      />
    </div>

    <Heading tag="h3" class="h-leather mb-3">For wiki pages</Heading>

    <P class="mb-3">
      Alexandria now supports wiki pages (kind 30818), allowing for
      collaborative knowledge bases and documentation. Wiki pages, such as this
      one about the <button
        class="underline text-primary-700 bg-transparent border-none p-0"
        onclick={() => goto("/publication/d/sybil")}>Sybil utility</button
      > use the same Asciidoc format as other publications but are specifically designed
      for interconnected, evolving content.
    </P>

    <P class="mb-3">
      Wiki pages can be linked to from other publications and can contain links
      to other wiki pages, creating a web of knowledge that can be navigated and
      explored.
    </P>

    <Heading tag="h3" class="h-leather mb-3">For long-form articles</Heading>

    <P class="mb-3">
      We also display long-form articles (kind 30023), which are stand-alone documents. An example is
      the article that launched this project's concept, <button
        class="underline text-primary-700 bg-transparent border-none p-0"
        onclick={() => goto("/publication/naddr/naddr1qvzqqqr4gupzphtxf40yq9jr82xdd8cqtts5szqyx5tcndvaukhsvfmduetr85ceqyw8wumn8ghj7cmgwf5hxarsd9kxctnwdaehgu339e3k7mf0qyf8wumn8ghj7mn0wd68yv339e3k7mf0qqxnzde38yerqdpexsmnyvek0wj7rv")}> Project Alexandria</button>.
        Long-form articles utilize simple Markdown formatting.
    </P>

    <Heading tag="h3" class="h-leather mb-3">Additional features</Heading>

    <P class="mb-3">
      The app also has a powerful search interface, a composition form, and a universal publisher.
    </P>

    <P class="mb-3">
      Thank you for your time. Feel free to explore the app and see how it works, and make sure to <button
      class="underline text-primary-700 bg-transparent border-none p-0"
      onclick={() => goto("/about")}>save our contact information</button>! 
    </P>

    <Img src="https://raw.githubusercontent.com/ShadowySupercode/gitcitadel/master/logos/GitCitadel_Logo.png" alt="GitCitadel Logo" class="image-border rounded-lg" width="200" />

    <P class="mb-3">
      If you have any questions or feedback, please feel free to <button
      class="underline text-primary-700 bg-transparent border-none p-0"
      onclick={() => goto("/contact")}>contact us</button>.
    </P>
    
  </div>
