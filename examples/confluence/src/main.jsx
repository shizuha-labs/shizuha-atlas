import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { requestConfluence, router, view } from '@forge/bridge'
import { AtlasEditor, AtlasExplorer, createAtlasDocument, safeSourceUrl } from '@shizuha/atlas'
import '@shizuha/atlas/styles.css'
import { createConfluenceStore } from './storage.mjs'
import './style.css'

function App() {
  const [document, setDocument] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const session = useRef(null)
  const current = useRef(null)
  const saving = useRef(false)
  useEffect(() => {
    let active = true
    async function start() {
      const context = await view.getContext()
      const store = createConfluenceStore({ requestConfluence, pageId: context.extension?.content?.id })
      const configured = context.extension?.config?.atlasPropertyKey
      if (!configured && !__ATLAS_CONFIG__) throw new Error('Edit this macro to create or import an Atlas document.')
      const key = configured || `shizuha-atlas:${crypto.randomUUID()}`
      const baseline = configured ? await store.load(key) : null
      const loaded = baseline?.document || createAtlasDocument()
      if (!active) return
      session.current = { store, key, baseline }
      current.current = loaded
      setDocument(loaded)
    }
    start().catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [])

  async function save(documentToSave, close = false) {
    if (saving.current) throw new Error('A save is already in progress')
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const state = session.current
      state.baseline = await state.store.save({ key: state.key, baseline: state.baseline, document: documentToSave })
      if (close) await view.submit({ config: { atlasPropertyKey: state.key } })
      return true
    } catch (failure) {
      setError(failure.message)
      throw failure
    } finally { saving.current = false; setBusy(false) }
  }

  const openSource = async url => {
    const safe = safeSourceUrl(url)
    if (!safe) throw new Error('Unsafe source link')
    await router.navigate(safe)
  }

  return <main>
    {error && <div className="forge-error" role="alert">{error}</div>}
    {!document && !error && <p role="status">Loading Atlas from this Confluence page…</p>}
    {document && (__ATLAS_CONFIG__
      ? <><div className="forge-note">Changes are stored as page attachments when saved. Page permissions and version checks apply.</div><AtlasEditor document={document} onChange={next => { current.current = next; setDocument(next) }} onSave={next => save(next)} saving={busy} /></>
      : <MemoryRouter><AtlasExplorer model={document.model} onOpenSource={openSource} /></MemoryRouter>)}
    {__ATLAS_CONFIG__ && <footer><button disabled={busy} onClick={() => view.close().catch(failure => setError(failure.message))}>Close</button><button disabled={!document || busy} onClick={() => save(current.current, true).catch(() => {})}>{busy ? 'Saving…' : 'Save and use diagram'}</button></footer>}
  </main>
}

createRoot(window.document.getElementById('root')).render(<App />)
