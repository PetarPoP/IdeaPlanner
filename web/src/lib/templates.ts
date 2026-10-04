import type { Board, CostItem, Edge, Node, Place, Stop, Task } from './model.gen'
import type { NodeType } from './catalog'
import { SAMPLE_PEOPLE } from './catalog'
import { uid } from './ids'

type NodeBody<T extends NodeType> = Omit<Extract<Node, { type: T }>, 'id' | 'x' | 'y' | 'w' | 'title' | 'icon' | 'accent'>

const it = (text: string, cost?: number, paid = false, payer = 0): CostItem => ({
  id: uid(),
  text,
  cost: cost == null ? '' : String(cost),
  paid,
  payer,
})
const ck = (text: string, done = false, who: number | null = null): Task => ({ id: uid(), text, done, who })
const st = (time: string, place: string, cost?: number): Stop => ({
  id: uid(),
  time,
  place,
  cost: cost == null ? '' : String(cost),
})
const pl = (name: string, cat: number, hearts: number[] = []): Place => ({ id: uid(), name, cat, hearts })
const opt = (text: string, votes: number[] = []) => ({ id: uid(), text, votes })

const card = (id: string, x: number, y: number, w: number, title: string, icon: string, accent = false) => ({
  id,
  x,
  y,
  w,
  title,
  icon,
  accent,
})
const sec = (id: string, x: number, y: number, title: string, icon: string, items: CostItem[], budget = ''): Node => ({
  ...card(id, x, y, 280, title, icon),
  type: 'section',
  items,
  budget,
})
const note = (id: string, x: number, y: number, w: number, title: string, icon: string, text: string, votes: number[], author: string): Node => ({
  ...card(id, x, y, w, title, icon, true),
  type: 'note',
  text,
  votes,
  author,
})
const edges = (...pairs: Array<[string, string]>): Edge[] => pairs.map(([from, to], i) => ({ id: `e${i + 1}`, from, to }))

export type TemplateKey = 'roadtrip' | 'santa' | 'party' | 'reno' | 'wedding' | 'blank'

export const TEMPLATES: ReadonlyArray<{ key: TemplateKey; icon: string; name: string; desc: string }> = [
  { key: 'roadtrip', icon: 'van', name: 'Road trip / Vacation', desc: 'Day-by-day plans, route map, bookings, saved places, costs and packing.' },
  { key: 'santa', icon: 'gift', name: 'Secret Santa', desc: 'Name draw with hidden pairs, wishlists, spend cap and date poll.' },
  { key: 'party', icon: 'confetti', name: 'Party planning', desc: 'Guest list, menu and supplies costs, theme vote, venue map.' },
  { key: 'reno', icon: 'hammer', name: 'Home renovation', desc: 'Quotes vs budget, materials, tasks, moodboard.' },
  { key: 'wedding', icon: 'heart', name: 'Wedding prep', desc: 'Venue, vendors, guests, run-of-day timeline, cake vote.' },
  { key: 'blank', icon: 'plus', name: 'Blank board', desc: 'Start from an empty canvas.' },
]

type Content = Pick<Board, 'title' | 'icon' | 'date' | 'cap' | 'cur' | 'nodes' | 'edges'>

const CONTENT: Record<TemplateKey, () => Content> = {
  roadtrip: () => ({
    title: 'Portugal road trip',
    icon: 'van',
    date: '2027-06-12',
    cap: '5000',
    cur: '€',
    nodes: [
      { ...card('map', 0, 0, 520, 'Route', 'map-trifold'), type: 'map', input: 'Lisbon → Sintra → Lagos → Sagres' },
      { ...card('d1', 580, 0, 300, 'Day 1 · Lisbon', 'calendar-dots'), type: 'itinerary', date: 'Sat, Jun 12', stops: [st('10:00', 'Lisbon Airport'), st('12:30', 'Time Out Market Lisboa', 90), st('15:00', 'Alfama, Lisbon'), st('19:30', 'Miradouro da Senhora do Monte')] },
      { ...card('d2', 920, 0, 300, 'Day 2 · Sintra', 'calendar-dots'), type: 'itinerary', date: 'Sun, Jun 13', stops: [st('09:00', 'Pena Palace, Sintra', 120), st('13:00', 'Quinta da Regaleira', 60), st('17:30', 'Cabo da Roca')] },
      { ...card('d3', 1260, 0, 300, 'Day 3 · South', 'calendar-dots'), type: 'itinerary', date: 'Mon, Jun 14', stops: [st('09:30', 'Lisbon'), st('12:30', 'Comporta'), st('18:00', 'Lagos, Portugal')] },
      sec('acc', 0, 580, 'Accommodation', 'bed', [it('Alfama apartment · 3 nights', 420, true, 0), it('Villa near Lagos · 4 nights', 660)], '1200'),
      sec('tra', 320, 580, 'Transport', 'car-profile', [it('9-seat van, 7 days', 520, true, 2), it('Fuel & tolls', 220)]),
      sec('act', 640, 580, 'Activities', 'person-simple-swim', [it('Surf lesson ×6', 270), it('Benagil boat tour', 150)]),
      sec('food', 960, 580, 'Food & drinks', 'fork-knife', [it('Groceries kitty', 300, true, 1), it('Two dinners out', 200)]),
      { ...card('fl', 1300, 580, 280, 'Flights', 'airplane-tilt'), type: 'booking', kind: 'Flight', from: 'ZAG', to: 'LIS', when: 'Jun 12 · 07:05', conf: 'TP4K9Q', cost: '840', paid: true, payer: 0 },
      { ...card('pack', 0, 900, 280, 'Packing list', 'backpack'), type: 'checklist', items: [ck('Passports', true, 0), ck('Sunscreen SPF50', true, 1), ck('Wetsuits ×2', false, 2), ck('Portable speaker', false, 5), ck('Beach towels')] },
      note('idea', 320, 900, 260, 'Night idea', 'lightbulb', 'Sunset at Miradouro da Senhora do Monte, then fado in Alfama.', [1, 2, 3, 4], 'Maja'),
      { ...card('poll', 640, 920, 280, 'Day 5 — where to?', 'chart-bar'), type: 'poll', options: [opt('Benagil caves', [1, 4, 5]), opt('Sagres & Cabo São Vicente', [2, 3])] },
      { ...card('plc', 960, 900, 300, 'Saved places', 'push-pin'), type: 'places', items: [pl('Praia da Marinha', 0, [0, 1, 4]), pl('Ponta da Piedade', 1, [1, 2]), pl('A Eira do Mel', 2, [3]), pl('Benagil cave', 3, [0, 5])] },
      { ...card('img', 1300, 900, 280, 'Villa photos', 'image'), type: 'image', src: null },
    ],
    edges: edges(['map', 'd1'], ['d1', 'd2'], ['d2', 'd3'], ['idea', 'act'], ['poll', 'act'], ['plc', 'map']),
  }),
  santa: () => ({
    title: 'Office Secret Santa',
    icon: 'gift',
    date: '2026-12-18',
    cap: '250',
    cur: '€',
    nodes: [
      { ...card('santa', 0, 0, 300, 'Name draw', 'shuffle'), type: 'santa', cap: '30', pairs: null, revealed: [] },
      note('rules', 360, 0, 280, 'Rules', 'scroll', 'Max €30. Exchange at the office party on Dec 18. Homemade gifts are welcome.', [0, 1, 2, 3, 4, 5], 'Ana'),
      sec('wish', 360, 240, 'Wishlist — Ana', 'list-heart', [it('Ceramic mug', 18), it('Hiking socks', 12)]),
      sec('sup', 700, 0, 'Party supplies', 'confetti', [it('Mulled wine', 25, true, 1), it('Cookies', 15)]),
      { ...card('pd', 700, 260, 280, 'Exchange date', 'chart-bar'), type: 'poll', options: [opt('Thu, Dec 17', [2]), opt('Fri, Dec 18', [0, 1, 3, 4])] },
      { ...card('todo', 0, 380, 300, 'To do', 'check-square'), type: 'checklist', items: [ck('Send invites', true, 0), ck('Draw names', false, 0), ck('Book the meeting room', false, 1)] },
    ],
    edges: edges(['santa', 'rules'], ['rules', 'wish'], ['pd', 'sup']),
  }),
  party: () => ({
    title: 'Luka turns 30',
    icon: 'cake',
    date: '2026-11-07',
    cap: '800',
    cur: '€',
    nodes: [
      { ...card('g', 0, 0, 280, 'Guest list', 'users'), type: 'checklist', items: [ck('Ana', true), ck('Maja', true), ck('Ivan'), ck('Sara + Tom')] },
      sec('menu', 340, 0, 'Menu', 'fork-knife', [it('Catering platters', 180), it('Cake', 65, true, 1), it('Drinks', 140)]),
      sec('sup', 680, 0, 'Supplies', 'confetti', [it('Decorations', 40), it('Venue deposit', 100, true, 0)]),
      { ...card('th', 340, 300, 280, 'Theme', 'chart-bar'), type: 'poll', options: [opt('90s night', [0, 3]), opt('Garden party', [1]), opt('Casino')] },
      note('sp', 680, 280, 280, 'Surprise plan', 'lightbulb', 'Luka thinks it is dinner for four. Everyone hides by 20:30.', [1, 2, 3], 'Maja'),
      { ...card('map', 0, 280, 300, 'Venue', 'map-trifold'), type: 'map', input: 'Zagreb Upper Town' },
    ],
    edges: edges(['sp', 'sup'], ['th', 'menu']),
  }),
  reno: () => ({
    title: 'Kitchen renovation',
    icon: 'hammer',
    date: '2027-03-01',
    cap: '12000',
    cur: '€',
    nodes: [
      sec('q', 0, 0, 'Quotes', 'receipt', [it('Cabinets — Studio Drvo', 4200), it('Countertop', 1800), it('Electrician', 650, true, 0)], '7000'),
      sec('m', 340, 0, 'Materials', 'package', [it('Tiles 32 m²', 780), it('Paint', 120, true, 0), it('Sink & tap', 390)]),
      { ...card('t', 680, 0, 280, 'Tasks', 'check-square'), type: 'checklist', items: [ck('Measure walls', true, 0), ck('Pick tile sample', true, 1), ck('Book electrician', false, 0), ck('Order appliances', false, 1)] },
      { ...card('mood', 0, 300, 300, 'Moodboard', 'image'), type: 'image', src: null },
      { ...card('cp', 340, 300, 280, 'Countertop', 'chart-bar'), type: 'poll', options: [opt('Oak', [0]), opt('Terrazzo', [1]), opt('Quartz')] },
      note('n', 680, 300, 280, 'Idea', 'lightbulb', 'Open shelves on the left wall instead of upper cabinets?', [0], 'Ana'),
    ],
    edges: edges(['cp', 'q'], ['n', 'q']),
  }),
  wedding: () => ({
    title: 'Sara & Tom wedding',
    icon: 'heart',
    date: '2027-09-04',
    cap: '22000',
    cur: '€',
    nodes: [
      sec('v', 0, 0, 'Venue & food', 'champagne', [it('Vineyard venue', 6500, true, 4), it('Catering · 120 guests', 7200)]),
      sec('ven', 340, 0, 'Vendors', 'storefront', [it('Photographer', 1800), it('Band', 2200), it('Flowers', 900)]),
      { ...card('gl', 680, 0, 280, 'Guests', 'users'), type: 'checklist', items: [ck('Save-the-dates sent', true, 4), ck('Final head count', false, 5), ck('Seating chart', false, 4)] },
      { ...card('tl', 0, 300, 300, 'The day', 'calendar-dots'), type: 'itinerary', date: 'Sat, Sep 4', stops: [st('15:00', 'Getting ready'), st('17:00', 'Ceremony'), st('19:00', 'Dinner'), st('21:30', 'First dance')] },
      { ...card('map', 340, 300, 420, 'Venue', 'map-trifold'), type: 'map', input: 'Momjan, Croatia' },
      { ...card('ck', 800, 300, 280, 'Cake', 'chart-bar'), type: 'poll', options: [opt('Lemon & elderflower', [4, 5]), opt('Chocolate', [0])] },
    ],
    edges: edges(['map', 'v'], ['ck', 'v']),
  }),
  blank: () => ({
    title: 'Untitled plan',
    icon: 'sparkle',
    date: '',
    cap: '1000',
    cur: '€',
    nodes: [
      note('start', 0, 0, 300, 'Start here', 'lightbulb', 'Add cards from the toolbar, double-click the board for a quick idea, and drag the + on a card edge to connect.', [], 'You'),
    ],
    edges: [],
  }),
}

/**
 * Builds a board from a template. The board keeps its id, people and group
 * size; the sample group fills in when there are too few people for the
 * template's payers and votes.
 */
export function fromTemplate(key: TemplateKey, keep: Pick<Board, 'id'> & Partial<Pick<Board, 'people' | 'splitN'>>): Board {
  const people = keep.people && keep.people.length >= SAMPLE_PEOPLE.length ? keep.people : structuredClone(SAMPLE_PEOPLE)
  return {
    ...CONTENT[key](),
    id: keep.id,
    people,
    splitN: Math.min(keep.splitN ?? 6, people.length),
    strokes: [],
    activity: [],
  }
}

export const DEFAULT_WIDTH: Record<NodeType, number> = {
  map: 480,
  itinerary: 300,
  places: 300,
  section: 280,
  poll: 280,
  booking: 280,
  santa: 300,
  note: 260,
  checklist: 260,
  link: 260,
  image: 260,
}

/** A fresh card of `type`, without position. */
export function newCard<T extends NodeType>(type: T): Omit<Extract<Node, { type: T }>, 'x' | 'y'> {
  const defaults: { [K in NodeType]: { title: string; icon: string; accent?: boolean } & NodeBody<K> } = {
    section: { title: 'New costs', icon: 'coins', type: 'section', items: [it('')], budget: '' },
    note: { title: 'Idea', icon: 'lightbulb', accent: true, type: 'note', text: '', votes: [], author: 'You' },
    checklist: { title: 'Checklist', icon: 'check-square', type: 'checklist', items: [ck('')] },
    poll: { title: 'Quick poll', icon: 'chart-bar', type: 'poll', options: [opt('Option A'), opt('Option B')] },
    link: { title: 'Link', icon: 'link', type: 'link', url: '' },
    image: { title: 'Photo', icon: 'image', type: 'image', src: null },
    santa: { title: 'Name draw', icon: 'shuffle', type: 'santa', cap: '30', pairs: null, revealed: [] },
    map: { title: 'Map', icon: 'map-trifold', type: 'map', input: '' },
    itinerary: { title: 'New day', icon: 'calendar-dots', type: 'itinerary', date: '', stops: [st('', '')] },
    booking: { title: 'Booking', icon: 'airplane-tilt', type: 'booking', kind: 'Flight', from: '', to: '', when: '', conf: '', cost: '', paid: false, payer: 0 },
    places: { title: 'Places to visit', icon: 'push-pin', type: 'places', items: [pl('', 0)] },
  }
  const { accent = false, ...rest } = defaults[type]
  return { id: uid(), w: DEFAULT_WIDTH[type], accent, ...rest } as unknown as Omit<Extract<Node, { type: T }>, 'x' | 'y'>
}

export const newItem = { cost: () => it(''), task: () => ck(''), stop: () => st('', ''), place: () => pl('', 0), option: (text = 'New option') => opt(text) }

/** Deep copy of a card with fresh ids for it and its rows. */
export function duplicateCard(n: Node, dx = 40, dy = 40): Node {
  const c = structuredClone(n)
  c.id = uid()
  c.x += dx
  c.y += dy
  if ('items' in c) for (const i of c.items) i.id = uid()
  if ('stops' in c) for (const s of c.stops) s.id = uid()
  if ('options' in c) for (const o of c.options) o.id = uid()
  return c
}
