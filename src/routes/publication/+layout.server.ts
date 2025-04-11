import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ url, parent }) => {
  const id = url.searchParams.get('id');
  const dTag = url.searchParams.get('d');

  const { ndk } = await parent();
  
  // Redirect to the appropriate canonical URL
  if (dTag) {
    // Michael J 11 April 2025 - Ideally, we should get additional parameters to specify the
    // index event so as to avoid event d-tag collisions.
    const indexEvent = await ndk.fetchEvent({
      '#d': [dTag],
    });
    const pubkey = indexEvent?.pubkey;
    redirect(301, `/publication/${pubkey}/${dTag}`);
  } else if (id) {
    const indexEvent = await ndk.fetchEvent({
      id: id,
    });
    const pubkey = indexEvent?.pubkey;
    const dTag = indexEvent?.getMatchingTags('#d')[0]?.[1];
    redirect(301, `/publication/${pubkey}/${dTag}`);
  } else {
    // If neither parameter is present, redirect to home
    redirect(301, '/');
  }
};
