import type { BookingKind, Node, Person } from './model.gen'

export type NodeType = Node['type']

/** Short label shown in each card's header. */
export const KIND_LABEL: Record<NodeType, string> = {
  section: 'Costs',
  note: 'Idea',
  checklist: 'Tasks',
  poll: 'Poll',
  link: 'Link',
  image: 'Photo',
  santa: 'Draw',
  map: 'Map',
  itinerary: 'Day',
  booking: 'Booking',
  places: 'Places',
  email: 'Email',
  sticky: 'Sticky',
  frame: 'Frame',
}

/** Wording for the activity log ("added a day plan"). */
export const KIND_NOUN: Partial<Record<NodeType, string>> = {
  section: 'cost card',
  itinerary: 'day plan',
  santa: 'name draw',
  checklist: 'checklist',
  email: 'email',
}

/** Every card people can add, in menu order. */
export const CARD_MENU: ReadonlyArray<{ type: NodeType; icon: string; label: string; desc: string }> = [
  { type: 'note', icon: 'lightbulb', label: 'Idea', desc: 'A note the group can vote on' },
  { type: 'sticky', icon: 'note', label: 'Sticky note', desc: 'A quick coloured note' },
  { type: 'frame', icon: 'frame-corners', label: 'Frame', desc: 'Group cards in an area' },
  { type: 'section', icon: 'coins', label: 'Cost card', desc: 'Items with auto-sum' },
  { type: 'itinerary', icon: 'calendar-dots', label: 'Day plan', desc: 'Stops with times and costs' },
  { type: 'booking', icon: 'airplane-tilt', label: 'Booking', desc: 'Flight, stay, car, ticket' },
  { type: 'map', icon: 'map-trifold', label: 'Map', desc: 'A place or a route' },
  { type: 'places', icon: 'push-pin', label: 'Places to visit', desc: 'Saved spots with hearts' },
  { type: 'checklist', icon: 'check-square', label: 'Checklist', desc: 'Tasks with assignees' },
  { type: 'poll', icon: 'chart-bar', label: 'Poll', desc: 'Let the group vote' },
  { type: 'link', icon: 'link', label: 'Link', desc: 'Bookmark a page' },
  { type: 'image', icon: 'image', label: 'Photo', desc: 'Drop or paste an image' },
  { type: 'email', icon: 'envelope-simple', label: 'Email', desc: 'Paste or forward an email' },
  { type: 'santa', icon: 'shuffle', label: 'Name draw', desc: 'Secret Santa pairs' },
]

export interface CardColor {
  /** Stored in `Node.color`; empty is the default surface. */
  key: string
  label: string
  /** Card background. */
  bg: string
  /** Top edge, frame border and swatch. */
  border: string
}

const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, var(--color-surface))`

/** Card colours, in picker order. */
export const CARD_COLORS: readonly CardColor[] = [
  { key: '', label: 'Default', bg: 'var(--color-surface)', border: 'var(--color-neutral-600)' },
  { key: 'violet', label: 'Violet', bg: tint('var(--color-accent)', 22), border: 'var(--color-accent-400)' },
  { key: 'amber', label: 'Amber', bg: tint('var(--color-amber)', 18), border: 'var(--color-amber)' },
  { key: 'mint', label: 'Mint', bg: tint('var(--color-mint)', 16), border: 'var(--color-mint)' },
  { key: 'rose', label: 'Rose', bg: tint('var(--color-rose)', 18), border: 'var(--color-rose)' },
  { key: 'sky', label: 'Sky', bg: tint('var(--color-sky)', 18), border: 'var(--color-sky)' },
]

/** The palette entry for a stored colour key (unknown keys get the default). */
export const cardColor = (key: string): CardColor => CARD_COLORS.find((c) => c.key === key) ?? CARD_COLORS[0]!

/** Paper for a sticky: stronger than a card tint, amber when uncoloured. */
export const stickyPaper = (key: string) => tint(cardColor(key || 'amber').border, 34)

export const PLACE_CATEGORIES: ReadonlyArray<{ label: string; icon: string }> = [
  { label: 'Beach', icon: 'umbrella-simple' },
  { label: 'Viewpoint', icon: 'binoculars' },
  { label: 'Restaurant', icon: 'fork-knife' },
  { label: 'Tour', icon: 'ticket' },
  { label: 'Stay', icon: 'bed' },
  { label: 'Shop', icon: 'bag' },
]

/** Wording per booking kind: the two places and the two moments. */
export const BOOKING_KINDS: Record<BookingKind, { icon: string; from: string; to: string; start: string; end: string }> = {
  Flight: { icon: 'airplane-tilt', from: 'From', to: 'To', start: 'Depart', end: 'Return' },
  Stay: { icon: 'bed', from: 'Place', to: 'Room', start: 'Check-in', end: 'Check-out' },
  Car: { icon: 'car-profile', from: 'Pickup at', to: 'Drop-off at', start: 'Pickup', end: 'Drop-off' },
  Ticket: { icon: 'ticket', from: 'Event', to: 'Seat', start: 'Starts', end: 'Ends' },
}

export const CURRENCIES = ['€', '$', '£', 'kn'] as const

/** The sample group the templates are written for. Person 0 is you. */
export const SAMPLE_PEOPLE: Person[] = [
  ['Ana', 'Ana Kovač', 'AK', 'Admin'],
  ['Maja', 'Maja Šimić', 'MS', 'Edit'],
  ['Luka', 'Luka Marić', 'LM', 'Edit'],
  ['Ivan', 'Ivan Perić', 'IP', 'Edit'],
  ['Sara', 'Sara Babić', 'SB', 'View'],
  ['Tom', 'Tom Rossi', 'TR', 'View'],
  ['Nika', 'Nika Horvat', 'NH', 'View'],
  ['Filip', 'Filip Kos', 'FK', 'View'],
].map(([name, full, ini, role]) => ({ name, full, ini, role, userId: '', email: '', paypal: '', revolut: '' }) as Person)

export const ME = 0

export function initials(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  const ini = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2)
  return ini.toUpperCase()
}
