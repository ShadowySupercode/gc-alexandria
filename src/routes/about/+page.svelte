<script lang="ts">
    import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { Heading, Img, P, A } from "flowbite-svelte";

  // Get the git tag version from environment variables
  const appVersion = import.meta.env.APP_VERSION || "development";
  const isVersionKnown = appVersion !== "development";
</script>

<div class="w-full flex justify-center">
  <main class="main-leather flex flex-col space-y-6 max-w-2xl w-full my-6 px-4">
    <div class="flex justify-between items-center">
      <Heading tag="h1" class="h-leather mb-2"
        >About the Library of Alexandria</Heading
      >
      {#if isVersionKnown}
        <span
          class="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-nowrap"
          >Version: {appVersion}</span
        >
      {/if}
    </div>
    <Img src="/screenshots/old_books.jpg" alt="Alexandria icon" />

    <P class="mb-3">
      Alexandria is a reader and writer for <A
        href="/publication?d=gitcitadel-project-documentation-curated-publications-specification-7-by-stella-v-1"
        >curated publications</A
      > (in Asciidoc), wiki pages (Asciidoc), and will eventually also support long-form
      articles (markup). It is produced by the <A
        href="/publication?d=gitcitadel-project-documentation-gitcitadel-project-1-by-stella-v-1"
        >GitCitadel project team</A
      >.
    </P>

    <P class="mb-3">
      Please submit support issues on the <A href="/contact"
        >Alexandria contact page</A
      > and follow us on <A
        href="https://github.com/ShadowySupercode/gitcitadel"
        target="_blank">GitHub</A
      > and <A href="https://geyser.fund/project/gitcitadel" target="_blank"
        >Geyserfund</A
      >.
    </P>

    <P>
      We are easiest to contact over our Nostr address {@render userBadge("npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz", "GitCitadel")}. Or, you can visit us on our <A
        href="https://gitcitadel.com"
        title="GitCitadel Homepage"
        target="_blank">homepage</A
      > and find out more about us, and the many projects we are working on.
    </P>
  </main>
</div>
