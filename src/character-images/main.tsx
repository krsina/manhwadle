import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CharacterImageReviewApp } from './CharacterImageReviewApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CharacterImageReviewApp />
  </StrictMode>,
)
