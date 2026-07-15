import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LibraryApp } from './LibraryApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LibraryApp />
  </StrictMode>,
)
