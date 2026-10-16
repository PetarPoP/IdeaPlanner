import { useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarPlus, DownloadSimple, Export, FileCsv, FilePdf, Printer, X } from '@phosphor-icons/react'
import { boardIcs, costsCsv, fileName } from '~/lib/export'
import { saveFile } from '~/lib/saveFile'
import { useBoard } from '~/store/board'
import { printItinerary } from '../views/PrintView'
import { Modal } from './Modal'

export function ExportDialog() {
  const close = () => useBoard.getState().set({ dialog: null })
  const [note, setNote] = useState('')

  const save = async (ext: 'csv' | 'ics') => {
    const b = useBoard.getState().board
    if (!b) return
    try {
      // The BOM makes Excel read the CSV as UTF-8 (€, č…).
      const path =
        ext === 'csv'
          ? await saveFile(fileName(b, 'csv'), 'text/csv', `﻿${costsCsv(b)}`)
          : await saveFile(fileName(b, 'ics'), 'text/calendar', boardIcs(b))
      setNote(path ? `Saved to ${path}` : '')
    } catch (e) {
      setNote(`Could not save the file: ${String(e)}`)
    }
  }

  const print = () => {
    close()
    printItinerary()
  }

  return (
    <Modal onClose={close} label="Export" className="max-w-[520px] gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <Export size={20} className="text-accent" />
        <span className="text-lg font-medium">Export</span>
        <button type="button" aria-label="Close" onClick={close} className="btn btn-icon ml-auto text-neutral-400">
          <X />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <Row
          icon={<FilePdf />}
          title="Itinerary as PDF"
          desc="Days, bookings and costs on clean pages. Choose “Save as PDF” to keep a file."
          action={
            <button type="button" onClick={print} className="btn btn-primary">
              <Printer />
              Print
            </button>
          }
        />
        <Row
          icon={<FileCsv />}
          title="Costs as CSV"
          desc="Every cost line with who paid, for a spreadsheet."
          action={
            <button type="button" onClick={() => void save('csv')} className="btn btn-secondary">
              <DownloadSimple />
              Download
            </button>
          }
        />
        <Row
          icon={<CalendarPlus />}
          title="Calendar (.ics)"
          desc="Day plans and bookings, for Google, Apple or Outlook calendars."
          action={
            <button type="button" onClick={() => void save('ics')} className="btn btn-secondary">
              <DownloadSimple />
              Download
            </button>
          }
        />
      </div>
      {note && (
        <span role="status" className="text-xs break-all text-neutral-400">
          {note}
        </span>
      )}
    </Modal>
  )
}

function Row({ icon, title, desc, action }: { icon: ReactNode; title: string; desc: string; action: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg px-3.5 py-3 shadow-inset">
      <span className="grid size-9 flex-none place-items-center rounded-lg bg-accent-900 text-lg text-accent-200">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-neutral-400">{desc}</span>
      </div>
      {action}
    </div>
  )
}
