// Local-only preview of the real evaluation component. No authentication or
// database request is made, and this plugin is never part of the production build.
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const route = '/.evaluation-preview.html'
const entry = `
  import React, {useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {MemoryRouter, Routes, Route} from 'react-router-dom';
  import SubmitEvaluation from '/src/pages/user/SubmitEvaluation.tsx';
  import '/src/index.css';
  function Preview() {
    const [revision, setRevision] = useState(0);
    return <><div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900"><p>Evaluation preview · sample activity. Submissions are not saved.</p><button className="min-h-11 rounded-lg border border-blue-200 bg-white px-3 font-semibold" onClick={() => setRevision(value => value + 1)}>Reset preview</button></div><MemoryRouter key={revision} initialEntries={['/evaluate/preview']}><Routes><Route path="/evaluate/:activityId" element={<SubmitEvaluation />} /></Routes></MemoryRouter></>;
  }
  createRoot(document.getElementById('root')).render(<Preview />);
`
const entryCode = ts.transpileModule(entry, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023}}).outputText
const plugin = {
  name: 'local-evaluation-preview',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id === 'virtual:evaluation-preview') return '\0evaluation-preview-entry'
    if (!importer?.replaceAll('\\', '/').includes('/pages/user/SubmitEvaluation.tsx')) return
    if (id.endsWith('/registrationService')) return '\0evaluation-preview-registration'
    if (id.endsWith('/evaluationService')) return '\0evaluation-preview-service'
  },
  load(id) {
    if (id === '\0evaluation-preview-entry') return {code: entryCode, map: null}
    if (id === '\0evaluation-preview-registration') return `export async function fetchMyRegistrations(){return {ok:true,data:[{activityId:'preview',refCode:'PREVIEW',status:'attended',hasEvaluation:false,hasAttended:true,activityStatus:'completed'}]}}`
    if (id === '\0evaluation-preview-service') return `export async function submitEvaluation(payload){window.__evaluationPreviewSubmission=payload;return {ok:true}};export async function recordAttendanceForSubmittedEvaluation(){return {ok:true}}`
  },
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== route) return next()
      try {
        const html = await server.transformIndexHtml(route, '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PCYDO Prime - Evaluation preview</title></head><body><div id="root"></div><script type="module" src="/@id/virtual:evaluation-preview"></script></body></html>')
        response.setHeader('Content-Type', 'text/html')
        response.end(html)
      } catch (error) { next(error) }
    })
  },
}
const server = await createServer({root, configFile: resolve(root, 'vite.config.ts'), cacheDir: resolve(root, 'node_modules/.cache/evaluation-preview'), plugins: [plugin], server: {host:'127.0.0.1', port:5187, strictPort:true}})
await server.listen()
console.log(`Evaluation preview: http://127.0.0.1:5187${route}`)
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); process.exit(0) })
