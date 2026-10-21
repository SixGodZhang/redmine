import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { useRef, useState } from 'react'
import { Button } from './ui'

type Request = { title: string; description: string }

export function useConfirm() {
  const resolver = useRef<((value: boolean) => void) | null>(null)
  const [request, setRequest] = useState<Request | null>(null)

  function confirm(next: Request) {
    setRequest(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }

  function close(result: boolean) {
    resolver.current?.(result)
    resolver.current = null
    setRequest(null)
  }

  const dialog = (
    <Dialog open={request !== null} onClose={() => close(false)} className="relative z-[70]">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
          <DialogTitle className="text-lg font-semibold text-gray-900">{request?.title}</DialogTitle>
          <p className="mt-2 text-sm text-gray-600">{request?.description}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={() => close(true)}>
              确认删除
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )

  return { confirm, dialog }
}
