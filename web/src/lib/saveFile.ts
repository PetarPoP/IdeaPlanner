import { invoke, isTauri } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'

/**
 * Hands a text file to the person: a download in the browser; in the Tauri
 * app (where `<a download>` does nothing) a file in Downloads, then shown in
 * the file manager. Resolves to where it went, when known.
 */
export async function saveFile(name: string, mime: string, text: string): Promise<string | null> {
  if (isTauri()) {
    const path = await invoke<string>('save_text_file', { name, contents: text })
    await revealItemInDir(path).catch(() => {
      // No file manager to show it in (mobile); the path is reported instead.
    })
    return path
  }
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return null
}
