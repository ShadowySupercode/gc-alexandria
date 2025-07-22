import type { NostrProfile } from "$lib/utils/search_utility";

export interface ModalState {
  mention: { show: boolean; search: string; results: NostrProfile[]; loading: boolean };
  wikilink: { show: boolean; target: string; label: string };
  image: { show: boolean; url: string; alt: string };
  link: { show: boolean; url: string; text: string };
  table: { show: boolean; data: { headers: string[]; rows: string[][] } };
  footnote: { show: boolean; id: string; text: string };
  heading: { show: boolean; level: number; text: string };
  emoji: { show: boolean };
}

export function createModalState() {
  const modalState = $state<ModalState>({
    mention: { show: false, search: "", results: [], loading: false },
    wikilink: { show: false, target: "", label: "" },
    image: { show: false, url: "", alt: "" },
    link: { show: false, url: "", text: "" },
    table: { show: false, data: { headers: [], rows: [] } },
    footnote: { show: false, id: "", text: "" },
    heading: { show: false, level: 1, text: "" },
    emoji: { show: false },
  });

  const communityStatus = $state<Record<string, boolean>>({});

  function openModal(modalName: keyof ModalState) {
    Object.keys(modalState).forEach(key => {
      if (key === modalName) {
        modalState[key as keyof ModalState].show = true;
      } else {
        modalState[key as keyof ModalState].show = false;
      }
    });
  }

  function closeModal(modalName: keyof ModalState) {
    modalState[modalName].show = false;
  }

  return {
    modalState,
    communityStatus,
    openModal,
    closeModal,
  };
} 