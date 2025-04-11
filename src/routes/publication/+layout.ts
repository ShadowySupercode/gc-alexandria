import type { LayoutLoad } from './$types';

export const ssr = true;

export const load: LayoutLoad = ({ url, params }) => {
  const { pubkey, tag } = params;

  return {
    url,
    pubkey,
    tag,
  };
};