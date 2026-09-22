import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AtlasExplorer } from '../../src/index.jsx'
import model from '../sample-model.json'
import '@xyflow/react/dist/style.css'
import '../../src/atlas.css'

const initialSearch = window.location.hash.startsWith('#?') ? window.location.hash.slice(1) : ''

function StandaloneDemo() {
  const [notice, setNotice] = useState('')
  const shareView = ({ search }) => {
    window.location.hash = search ? `?${search}` : ''
    setNotice('View saved in this file’s address. Bookmark it to reopen this view on this device; it is not a public sharing link.')
  }

  return <div className="standalone-shell">
    <header className="standalone-notice" aria-label="Offline demo information">
      <strong>Atlas · Offline viewer demo</strong>
      <p>Fictional example system · No server, account or internet needed · Viewer only, not an editor.</p>
      <p role="status" aria-live="polite">{notice}</p>
    </header>
    <MemoryRouter initialEntries={[`/${initialSearch}`]}>
      <AtlasExplorer model={model} backLabel="Return to demo overview" onShareView={shareView} />
    </MemoryRouter>
  </div>
}

createRoot(document.getElementById('root')).render(<StandaloneDemo />)
