import { dismiss, useToasts } from '~/store/toast'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div key={t.id} className="glass anim-toast pointer-events-auto flex items-center gap-3 rounded-xl py-2 pr-2 pl-3.5 text-[13px] shadow-lg">
          {t.text}
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
              className="btn btn-primary px-2.5 py-1 text-xs"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
