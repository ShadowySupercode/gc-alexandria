import type { PageServerLoad } from './$types';

// This file just passes the query parameters to the client
// to avoid server-side localStorage errors
export const load: PageServerLoad = async ({ url }) => {
  const id = url.searchParams.get('id');
  const dTag = url.searchParams.get('d');

  console.log('Publication page server load', { id, dTag });

  return {
    id,
    dTag
  };
};
