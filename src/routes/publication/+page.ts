import type { Load } from '@sveltejs/kit';

export const load: Load = async ({ url }) => {
  let id = url.searchParams.get('id');
  let dTag = url.searchParams.get('d');
  // Normalize
  if (Array.isArray(id)) id = id[0];
  if (Array.isArray(dTag)) dTag = dTag[0];

  return { id, dTag, url };
};
