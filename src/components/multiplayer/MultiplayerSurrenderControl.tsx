import { useState } from 'react'
import { SurrenderModal } from '../SurrenderModal'

interface MultiplayerSurrenderControlProps {
  disabled?: boolean
  onConfirm: () => void
}

export function MultiplayerSurrenderControl({
  disabled = false,
  onConfirm,
}: MultiplayerSurrenderControlProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="surrender-toggle"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        I give up
      </button>
      <SurrenderModal
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          onConfirm()
        }}
      />
    </>
  )
}
