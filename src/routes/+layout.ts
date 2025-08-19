import type { LayoutLoad } from "./$types";
import { initNdk } from "$lib/ndk";

export const load: LayoutLoad = () => {
  return {
    ndk: initNdk(),
  };
}
