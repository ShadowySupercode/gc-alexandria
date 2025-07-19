export type Tab = {
  id: number;
  type: TabType;
  parent?: number;
  previous?: Tab;
  data?: unknown;
};

export type TabType =
  | "welcome"
  | "find"
  | "article"
  | "user"
  | "settings"
  | "editor";
