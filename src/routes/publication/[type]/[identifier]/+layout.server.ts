import type { LayoutServerLoad } from "./$types";


export const load: LayoutServerLoad = ({ url }: { url: URL }) => {
  const currentUrl = `${url.origin}${url.pathname}`;

  return {
    metadata: {
      currentUrl,
    },
  };
};
