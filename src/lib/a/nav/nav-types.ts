export type NavItem = {
  id?: string;
  title: string;
  href?: string;
  icon?: any;
  badge?: string;
  children?: NavItem[];
  divider?: boolean;
  external?: boolean;
};

export type UserInfo = {
  name: string;
  avatarUrl?: string;
};
