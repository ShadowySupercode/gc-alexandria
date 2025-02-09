// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      ndk?: NDK;
      parser?: Pharos;
      waitable?: Promise<any>;
      publicationType?: string;
    }
    // interface Platform {}
  }
}

export {};
