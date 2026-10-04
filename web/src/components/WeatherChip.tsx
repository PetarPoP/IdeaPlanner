import type { Icon } from '@phosphor-icons/react'
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from '@phosphor-icons/react'
import type { WeatherIcon } from '~/lib/weather'
import { tempLabel, weatherTitle } from '~/lib/weather'
import { useWeather } from '~/hooks/useGeo'
import { cx } from './ui'

const ICONS: Record<WeatherIcon, Icon> = { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning }

/** "☀ 24° / 17°" for a day at a place; nothing until (and unless) it is known. */
export function WeatherChip({ place, date, near, className }: { place: string; date: string; near?: string; className?: string }) {
  const { data: w } = useWeather(place, date, near)
  if (!w) return null
  const I = ICONS[w.icon]
  return (
    <span title={weatherTitle(w)} className={cx('anim-fade flex flex-none items-center gap-1 text-[11px] whitespace-nowrap text-neutral-400', className)}>
      <I weight="duotone" className="text-[13px] text-accent-300" />
      {tempLabel(w)}
    </span>
  )
}
