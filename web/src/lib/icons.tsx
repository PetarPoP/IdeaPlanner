import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react'
import {
  AirplaneTilt, Backpack, Bag, Bed, Binoculars, Cake, CalendarDots, CarProfile, Champagne, ChartBar,
  CheckSquare, Coins, Confetti, ForkKnife, Gift, Hammer, Heart, Image, Lightbulb, Link, ListHeart,
  MapTrifold, Package, PersonSimpleSwim, Plus, PushPin, Receipt, Scroll, Shuffle, Sparkle, Storefront,
  Ticket, UmbrellaSimple, Users, Van,
} from '@phosphor-icons/react'

/**
 * Icons a board document can name (cards, templates, place categories).
 * Documents store the Phosphor name so they stay plain JSON.
 */
const REGISTRY: Record<string, PhosphorIcon> = {
  'airplane-tilt': AirplaneTilt,
  backpack: Backpack,
  bag: Bag,
  bed: Bed,
  binoculars: Binoculars,
  cake: Cake,
  'calendar-dots': CalendarDots,
  'car-profile': CarProfile,
  champagne: Champagne,
  'chart-bar': ChartBar,
  'check-square': CheckSquare,
  coins: Coins,
  confetti: Confetti,
  'fork-knife': ForkKnife,
  gift: Gift,
  hammer: Hammer,
  heart: Heart,
  image: Image,
  lightbulb: Lightbulb,
  link: Link,
  'list-heart': ListHeart,
  'map-trifold': MapTrifold,
  package: Package,
  'person-simple-swim': PersonSimpleSwim,
  plus: Plus,
  'push-pin': PushPin,
  receipt: Receipt,
  scroll: Scroll,
  shuffle: Shuffle,
  sparkle: Sparkle,
  storefront: Storefront,
  ticket: Ticket,
  'umbrella-simple': UmbrellaSimple,
  users: Users,
  van: Van,
}

interface Props {
  name: string
  size?: number | string
  weight?: IconWeight
  className?: string
}

export function NamedIcon({ name, size = '1em', weight, className }: Props) {
  const Cmp = REGISTRY[name] ?? Sparkle
  return <Cmp size={size} weight={weight} className={className} aria-hidden />
}
