import { useEffect } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

/** In the desktop/mobile app, open web links in the system browser instead of the app window. */
export function useExternalLinks() {
  useEffect(() => {
    if (!isTauri()) return
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null
      const href = a?.getAttribute('href')
      if (!href || !/^https?:\/\//i.test(href)) return
      e.preventDefault()
      void openUrl(href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}
