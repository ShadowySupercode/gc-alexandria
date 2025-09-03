<script lang="ts">
  import { userBadge } from "$lib/snippets/UserSnippets.svelte";
  import { Heading, Img, P, A } from "flowbite-svelte";
  import { goto } from "$app/navigation";
  import { getNdkContext } from "$lib/ndk";
  
  // Get the git tag version from environment variables
  const appVersion = import.meta.env.APP_VERSION || "development";
  const isVersionKnown = appVersion !== "development";

  const ndk = getNdkContext();
</script>

<div class="w-full max-w-3xl flex flex-col self-center mb-3">
    <div class="flex flex-col justify-between items-center mb-4">
      <Heading tag="h1" class="h-leather mb-2"
        >About the Library of Alexandria</Heading
      >
      {#if isVersionKnown}
        <span
          class="mt-2 text-sm bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-nowrap"
          >Version: {appVersion}</span
        >
      {/if}
    </div>
    <Img src="./screenshots/old_books.jpg" alt="Alexandria icon" class="my-3"/>

    <P class="mb-3">
      Alexandria is a reader and writer for <A
        href="./publication/d/gitcitadel-project-documentation-curated-publications-specification-7-by-stella-v-1"
        >curated publications</A
      > (in Asciidoc), wiki pages (Asciidoc), and will eventually also support long-form
      articles (markup). It is produced by the <A
        href="./publication/d/gitcitadel-project-documentation-by-stella-v-1"
        >GitCitadel project team</A
      >.
    </P>

    <P class="mb-3">
      Please submit support issues on the <button
        class="underline text-primary-700 bg-transparent border-none p-0"
        onclick={() => goto("/contact")}>Contact</button
      >
      page and follow us on <A
        href="https://github.com/ShadowySupercode/gitcitadel"
        target="_blank">GitHub</A
      > and <A href="https://geyser.fund/project/gitcitadel" target="_blank"
        >Geyserfund</A
      >.
    </P>

    <P>
      We are easiest to contact over our Nostr address {@render userBadge(
        "npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz",
        "GitCitadel",
        ndk,
      )}. Or, you can visit us on our <A
        href="https://gitcitadel.com"
        title="GitCitadel Homepage"
        target="_blank">homepage</A
      > and find out more about us, and the many projects we are working on.
    </P>
</div>
