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
}

/** Wording for the activity log ("added a day plan"). */
export const KIND_NOUN: Partial<Record<NodeType, string>> = {
  section: 'cost card',
  itinerary: 'day plan',
  santa: 'name draw',
}

export const PLACE_CATEGORIES: ReadonlyArray<{ label: string; icon: string }> = [
  { label: 'Beach', icon: 'umbrella-simple' },
  { label: 'Viewpoint', icon: 'binoculars' },
  { label: 'Restaurant', icon: 'fork-knife' },
  { label: 'Tour', icon: 'ticket' },
  { label: 'Stay', icon: 'bed' },
  { label: 'Shop', icon: 'bag' },
]

export const BOOKING_KINDS: Record<BookingKind, { icon: string; from: string; to: string }> = {
  Flight: { icon: 'airplane-tilt', from: 'From', to: 'To' },
  Stay: { icon: 'bed', from: 'Place', to: 'Nights' },
  Car: { icon: 'car-profile', from: 'Pickup', to: 'Return' },
  Ticket: { icon: 'ticket', from: 'Event', to: 'Seat' },
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
].map(([name, full, ini, role]) => ({ name, full, ini, role }) as Person)

export const ME = 0

export function initials(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  const ini = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2)
  return ini.toUpperCase()
}
