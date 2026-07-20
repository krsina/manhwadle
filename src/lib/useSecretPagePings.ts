import { useEffect } from 'react'
import { reportSecretEvent } from './secretEvents'

/** Fires Author's Note when any legal doc mounts. */
export function useLegalSecretPing() {
  useEffect(() => {
    void reportSecretEvent('legal_visit')
  }, [])
}
