/**
 * The tangle inventory for the journey. Same 16 tools, badges, positions and
 * links as the homepage Tangle (src/components/sections/Tangle.astro), which
 * keeps them in its frontmatter. If the journey replaces the homepage, both
 * read from one module; until then a change there is copied here.
 */
export type Kind = 'kept' | 'replaced';
export type Link = 'red' | 'orange' | 'gray';

export interface Card { id: string; name: string; badge: string; kind: Kind; x: number; y: number; rot: number }

export const CARDS: Card[] = [
  { id: 'wix', name: 'Wix', badge: 'expired plan', kind: 'replaced', x: 18, y: 11, rot: -14 },
  { id: 'squarespace', name: 'Squarespace', badge: 'trial ending', kind: 'replaced', x: 12, y: 32, rot: 11 },
  { id: 'godaddy', name: 'GoDaddy', badge: 'auto-renew wrong card', kind: 'replaced', x: 50, y: 49, rot: -6 },
  { id: 'mailchimp', name: 'Mailchimp', badge: 'forgot password', kind: 'replaced', x: 36, y: 17, rot: 18 },
  { id: 'constant', name: 'Constant Contact', badge: "haven't logged in", kind: 'replaced', x: 67, y: 60, rot: 20 },
  { id: 'calendly', name: 'Calendly', badge: 'calendar conflict', kind: 'replaced', x: 44, y: 30, rot: -19 },
  { id: 'hootsuite', name: 'Hootsuite', badge: '$49/mo billing', kind: 'replaced', x: 70, y: 36, rot: 7 },
  { id: 'hospitable', name: 'Hospitable', badge: '3 conflicting calendars', kind: 'replaced', x: 83, y: 87, rot: -9 },
  { id: 'square', name: 'Square', badge: '3 unread', kind: 'kept', x: 62, y: 9, rot: -8 },
  { id: 'quickbooks', name: 'QuickBooks', badge: 'needs login', kind: 'kept', x: 81, y: 19, rot: 22 },
  { id: 'stripe', name: 'Stripe', badge: '2 chargebacks', kind: 'kept', x: 86, y: 64, rot: -12 },
  { id: 'gmail', name: 'Gmail', badge: '47 unread', kind: 'kept', x: 89, y: 41, rot: -15 },
  { id: 'gcal', name: 'GCal', badge: 'double-booked', kind: 'kept', x: 39, y: 78, rot: -17 },
  { id: 'facebook', name: 'Facebook', badge: '2FA loop again', kind: 'kept', x: 22, y: 52, rot: 16 },
  { id: 'gbiz', name: 'Google Biz', badge: 'needs verification', kind: 'kept', x: 60, y: 84, rot: 14 },
  { id: 'yelp', name: 'Yelp', badge: 'managed by ex-employee', kind: 'kept', x: 14, y: 72, rot: 8 },
];

/** red: does not sync. orange: a manual workaround. gray: abandoned or duplicate. */
export const LINKS: { from: string; to: string; kind: Link }[] = [
  { from: 'mailchimp', to: 'square', kind: 'red' },
  { from: 'square', to: 'quickbooks', kind: 'red' },
  { from: 'stripe', to: 'quickbooks', kind: 'red' },
  { from: 'gmail', to: 'yelp', kind: 'red' },
  { from: 'hospitable', to: 'gcal', kind: 'red' },
  { from: 'facebook', to: 'gbiz', kind: 'red' },
  { from: 'wix', to: 'quickbooks', kind: 'orange' },
  { from: 'godaddy', to: 'wix', kind: 'orange' },
  { from: 'gcal', to: 'calendly', kind: 'orange' },
  { from: 'gbiz', to: 'yelp', kind: 'orange' },
  { from: 'constant', to: 'mailchimp', kind: 'gray' },
  { from: 'hootsuite', to: 'facebook', kind: 'gray' },
  { from: 'squarespace', to: 'wix', kind: 'gray' },
];

/** Kept tools settle in a ring around the seal, clockwise from the top left. */
export const RING = ['square', 'quickbooks', 'gmail', 'gbiz', 'stripe', 'gcal', 'facebook', 'yelp'];

/** Small deterministic hash so the mess is the same on every load. */
export function hash(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
