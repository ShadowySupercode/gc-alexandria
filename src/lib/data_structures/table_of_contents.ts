export interface TocEntry {
  title: string;
  href: string;
  expanded: boolean;
  children: Array<TocEntry> | null;
}
