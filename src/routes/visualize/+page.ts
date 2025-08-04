import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
  const eventId = url.searchParams.get('event');
  
  return {
    eventId
  };
};