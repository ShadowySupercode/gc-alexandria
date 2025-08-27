import type { NavItem } from '$lib/a/nav/nav-types';

export const siteNav: NavItem[] = [
  {
    title: 'Create',
    children: [
      { title: 'Compose notes', href: '/new/compose' },
      { title: 'Publish events', href: '/events/compose' },
    ]
  },
  {
    title: 'Explore',
    children: [
      { title: 'Publications', children: [
          { title: 'Publications', href: '/' },
          { title: 'My Notes', href: '/my-notes' },
          { title: 'Events', href: '/events' },
          { title: 'Visualize', href: '/visualize' }
        ]
      }
    ]
  },
  {
    title: 'About',
    children: [
      { title: 'Onboarding', children: [{ title: 'Getting Started', href: '/start' }] },
      { title: 'Project', children: [
          { title: 'About', href: '/about' },
          { title: 'Contact', href: '/contact' },
          { title: 'Relay Status', href: '/about/relay-stats' }
        ] }
    ]
  }
];

export const userMenu: NavItem[] = [
  { title: 'Profile', href: '/me' },
  { title: 'Settings', href: '/settings' },
  { divider: true, title: '' },
  { id: 'logout', title: 'Sign out' } // <-- no href => action item
];
