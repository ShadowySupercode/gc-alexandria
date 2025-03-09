<script lang='ts'>
  import { Heading } from "flowbite-svelte";
</script>

<div class='w-full flex justify-center'>
  <main class='main-leather flex flex-col space-y-4 max-w-2xl w-full mt-4 mb-4'>
    <Heading tag='h1' class='h-leather mb-2'>About</Heading>
    <p>Alexandria is a reader and writer for <a href="https://github.com/nostr-protocol/nips/pull/1600" class='underline'>curated publications</a> (in Asciidoc), and will eventually also support long-form articles (Markdown) and wiki pages (Asciidoc). It is produced by the <a href="https://wikistr.com/gitcitadel-project" class='underline'>GitCitadel project team</a>.</p>

    <p>Please submit support issues on the <a href="https://gitcitadel.com/r/naddr1qvzqqqrhnypzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqy88wumn8ghj7mn0wvhxcmmv9uqq5emfw33kjarpv3jkcs83wav" class='underline'>project repo page</a> and follow us on <a href="https://github.com/ShadowySupercode/gitcitadel" class='underline'>GitHub</a> and <a href="https://geyser.fund/project/gitcitadel" class='underline'>Geyserfund</a>.</p>

    <p>We are easiest to contact over our Nostr address <a  href="https://njump.me/nprofile1qqsggm4l0xs23qfjwnkfwf6fqcs66s3lz637gaxhl4nwd2vtle8rnfqprfmhxue69uhhg6r9vehhyetnwshxummnw3erztnrdaks5zhueg" class='underline'>npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz</a>.</p>

    <Heading tag='h2' class='h-leather mb-2'>Overview</Heading>
  
    <p>Alexandria opens up to the <a  href="https://next-alexandria.gitcitadel.eu/" class='underline'>landing page</a>, where the user can: login (top-right), select whether to only view the publications hosted on the <a href="https://thecitadel.nostr1.com/" class='underline'>thecitadel document relay</a> or add in their own relays, and scroll/search the publications.</p>

    <p><img src="/screenshots/LandingPage.png" alt="Landing page" class='image-border'></p>
    <p><img src="/screenshots/YourRelays.png" alt="Relay selection" class='image-border'></p>

    <p>There is also the ability to view the publications as a diagram, if you click on "Visualize", and to publish a note (coming soon).</p>

    <p>If you click on a card, which represents a 30040 index event, the associated reading view opens to the publication. The app then pulls all of the content events (30041s), in the order in which they are indexed, and displays them as a single document.</p>
    
    <p>Each 30041 section is also a level in the table of contents, which can be accessed from the floating icon top-left in the reading view. This allows for navigation within the publication. (This functionality has been temporarily disabled.)</p>

    <p><img src="/screenshots/ToC_icon.png" alt="ToC icon" class='image-border'></p>
    <p><img src="/screenshots/TableOfContents.png" alt="Table of contents example" class='image-border'></p>

    <Heading tag='h2' class='h-leather mb-2'>Typical use cases</Heading>

    <Heading tag='h3' class='h-leather mb-2'>For e-books</Heading>
    <p>The most common use for Alexandria is for e-books: both those users have written themselves and those uploaded to Nostr from other sources. The first minor version of the app, Gutenberg, is focused on displaying and producing these publications.</p>

    <p>An example of a book is <a  href="https://next-alexandria.gitcitadel.eu/publication?d=jane-eyre-an-autobiography-by-charlotte-bront%C3%83-v-third-edition" class='underline'>Jane Eyre</a></p>

    <p><img src="/screenshots/JaneEyre.png" alt="Jane Eyre, by Charlotte Brontë" class='image-border'></p>

    <Heading tag='h3' class='h-leather mb-2'>For scientific papers</Heading>
    <p>Alexandria will also display research papers with Asciimath and LaTeX embedding, and the normal advanced formatting options available for Asciidoc. In addition, we will be implementing special citation events, which will serve as an alternative or addition to the normal footnotes.</p>

    <p>Correctly displaying such papers, integrating citations, and allowing them to be reviewed (with kind 1111 comments), and annotated (with highlights) by users, is the focus of the second minor version, Euler.</p>

    <p>Euler will also pioneer the HTTP-based (rather than websocket-based) e-paper compatible version of the web app.</p>

    <p>An example of a research paper is <a  href="https://next-alexandria.gitcitadel.eu/publication?d=less-partnering-less-children-or-both-by-j.i.s.-hellstrand-v-1" class='underline'>Less Partnering, Less Children, or Both?</a></p>

    <p><img src="/screenshots/ResearchPaper.png" alt="Research paper" class='image-border'></p>

    <Heading tag='h3' class='h-leather mb-2'>For documentation</Heading>
    <p>Our own team uses Alexandria to document the app, to display our blog entries, as well as to store copies of our most interesting technical specifications.</p>

    <p><img src="/screenshots/Documentation.png" alt="Documentation" class='image-border'></p>

  </main>
</div>