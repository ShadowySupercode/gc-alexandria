import type { Load } from '@sveltejs/kit';

export const load: Load = async ({ url }) => {
  const id = url.searchParams.get('id');

  return {
    searchParams: {
      id: id
    }
  };
};