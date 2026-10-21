import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import type { FormEvent, ReactNode } from 'react'
import { Button } from './ui'

export function FormDialog({
  open,
  title,
  onClose,
  onSubmit,
  saving,
  error,
  children,
  submitLabel = '创建',
}: {
  open: boolean
  title: string
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  saving?: boolean
  error?: string | null
  children: ReactNode
  submitLabel?: string
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">{title}</DialogTitle>
          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            {children}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? '创建中…' : submitLabel}
              </Button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
