import type { LayoutLoad } from './$types';

export const ssr = true;

export const load: LayoutLoad = ({ url, params }) => {
  const { pubkey, dTag } = params;

  return {
    url,
    pubkey,
    tag: dTag, // For backward compatibility, map dTag to tag
  };
};
