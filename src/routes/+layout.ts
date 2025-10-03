import type { LayoutLoad } from "./$types";
import { initNdk } from "$lib/ndk";

export const ssr = false;

export const load: LayoutLoad = () => {
  return {
    ndk: initNdk(),
  };
};
