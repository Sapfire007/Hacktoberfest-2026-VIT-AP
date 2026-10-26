/** The admin console's sections — the sidebar on wide screens, the hub on phones. */
export interface AdminNavItem {
  href: string;
  /** Path segment used to highlight the active item. */
  match: string;
  label: string;
  icon: string;
  blurb: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/(admin)/overview', match: 'overview', label: 'Overview', icon: '🏠', blurb: 'Who is inside, today, alerts' },
  { href: '/(admin)/gate-log', match: 'gate-log', label: 'Entry / exit log', icon: '🚪', blurb: 'Every entry, exit and denial' },
  { href: '/(admin)/entries', match: 'entries', label: 'Gate records', icon: '🗂️', blurb: 'Visit records, ID photos' },
  { href: '/(admin)/analytics', match: 'analytics', label: 'Analytics', icon: '📊', blurb: 'Peak hours, gates, OCR accuracy' },
  { href: '/(admin)/reports', match: 'reports', label: 'Reports', icon: '📄', blurb: 'Daily register CSV / PDF' },
  { href: '/(admin)/passes', match: 'passes', label: 'Regular passes', icon: '🔁', blurb: 'Vendors, contractors, mess staff' },
  { href: '/(admin)/watchlist', match: 'watchlist', label: 'Watchlist', icon: '⚠️', blurb: 'Flag people and vehicles' },
  { href: '/(admin)/staff', match: 'staff', label: 'Staff', icon: '🪪', blurb: 'Faculty, security, admin accounts' },
  { href: '/(admin)/users', match: 'users', label: 'Visitor accounts', icon: '👤', blurb: 'Suspend and reactivate' },
  { href: '/(admin)/audit', match: 'audit', label: 'Audit log', icon: '🧾', blurb: 'Who did what, and when' },
];
