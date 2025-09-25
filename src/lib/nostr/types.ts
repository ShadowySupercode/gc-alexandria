export type NostrProfile = {
  name?: string;
  display_name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  lud16?: string;
  badges?: Array<{ label: string; color?: string }>;
};
