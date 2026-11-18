import { MAX_PROPOSAL_PAGES, validateUploadSet, type SourcePage } from './proposalModel'
import type { Worker } from 'tesseract.js'

function check(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Document reading cancelled.', 'AbortError') }
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  check(signal)
  return new Promise((resolve,reject) => {
    const cancel = () => reject(new DOMException('Document reading cancelled.','AbortError'))
    signal.addEventListener('abort',cancel,{once:true})
    promise.then(resolve,reject).finally(() => signal.removeEventListener('abort',cancel))
  })
}

// Inspect ZIP directory sizes before handing a DOCX to the converter.
export function checkDocxArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  let total = 0, entries = 0
  for (let offset = 0; offset + 46 <= view.byteLength; offset++) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue
    total += view.getUint32(offset + 24, true)
    entries++
    if (total > 60 * 1024 * 1024 || entries > 4000) throw new Error('This Word document expands beyond the safe processing limit. Export a smaller PDF instead.')
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Password-protected documents are not supported.')
    offset += 45 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  if (!entries) throw new Error('This is not a readable DOCX archive.')
}

export async function fingerprintFiles(files: File[]) {
  const hashes: string[] = []
  for (const file of files) {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    hashes.push(Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''))
  }
  // Detect the same photo set even if a user selects its pages in another order.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashes.sort().join(':')))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

export async function readProposal(files: File[], signal: AbortSignal, progress: (message: string) => void, forceOcr = false): Promise<SourcePage[]> {
  validateUploadSet(files)
  let worker: Worker | undefined
  let workerTerminated = false
  const pages: SourcePage[] = []
  async function terminateWorker() {
    if (worker && !workerTerminated) { workerTerminated = true; await worker.terminate().catch(() => undefined) }
  }
  const stop = () => { void terminateWorker() }
  signal.addEventListener('abort', stop)
  async function recognize(image: HTMLCanvasElement | File, page: number) {
    check(signal)
    progress(`Reading page ${page} with OCR… The first scan downloads the recognition model.`)
    if (!worker) {
      const { createWorker } = await import('tesseract.js')
      const pendingWorker = createWorker('eng', 1, { logger: update => {
        if (update.status === 'recognizing text') progress(`Reading page ${page} · ${Math.round(update.progress * 100)}%`)
      } })
      void pendingWorker.then(created => { if (signal.aborted) void created.terminate() }).catch(() => undefined)
      worker = await abortable(pendingWorker,signal)
    }
    check(signal)
    const result = await abortable(worker.recognize(image),signal)
    check(signal)
    return { page, text: result.data.text, method: 'ocr' as const, confidence: result.data.confidence }
  }
  try {
    const file = files[0]
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension === 'docx') {
      progress('Reading Word document…')
      const buffer = await file.arrayBuffer()
      checkDocxArchive(buffer)
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer }, { externalFileAccess: false, convertImage: mammoth.images.imgElement(async () => ({ src: '' })) })
      check(signal)
      // The generated HTML is parsed only to obtain text; it is never injected into the page.
      const doc = new DOMParser().parseFromString(result.value, 'text/html')
      const lines: string[] = []
      for (const element of Array.from(doc.body.children)) {
        if (element.tagName === 'TABLE') {
          for (const row of Array.from(element.querySelectorAll('tr'))) lines.push(Array.from(row.querySelectorAll('td,th')).map(cell => Array.from(cell.querySelectorAll('p')).map(paragraph => paragraph.textContent ?? '').join(' ') || cell.textContent || '').join(' | '))
        } else if (element.tagName === 'UL' || element.tagName === 'OL') lines.push(Array.from(element.querySelectorAll('li')).map(item => item.textContent ?? '').join('\n'))
        else lines.push(element.textContent ?? '')
      }
      pages.push({ page: null, method: 'text', text: lines.join('\n') })
    } else if (extension === 'pdf') {
      progress('Inspecting PDF pages…')
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
      const buffer = await file.arrayBuffer()
      if (!new TextDecoder().decode(buffer.slice(0, 1024)).includes('%PDF-')) throw new Error('This file does not contain a valid PDF.')
      const task = pdfjs.getDocument({ data: buffer })
      const cancelPdf = () => { void task.destroy() }
      signal.addEventListener('abort', cancelPdf)
      try {
        const pdf = await task.promise
        if (pdf.numPages > MAX_PROPOSAL_PAGES) throw new Error('PDF proposals must contain at most 20 pages.')
        for (let number = 1; number <= pdf.numPages; number++) {
          check(signal)
          progress(`Reading PDF page ${number} of ${pdf.numPages}…`)
          const page = await pdf.getPage(number)
          const content = await page.getTextContent()
          let text = '', previousY: number | undefined
          for (const item of content.items) {
            if (!('str' in item)) continue
            if (previousY !== undefined && Math.abs(item.transform[5] - previousY) > 3) text += '\n'
            text += item.str + (item.hasEOL ? '\n' : ' ')
            previousY = item.transform[5]
          }
          if (!forceOcr && text.replace(/\s/g, '').length >= 50) pages.push({ page: number, text, method: 'text' })
          else {
            const base = page.getViewport({ scale: 1 })
            const scale = Math.min(2, 2400 / Math.max(base.width, base.height))
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement('canvas')
            canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
            await page.render({ canvas, viewport }).promise
            pages.push(await recognize(canvas, number))
            canvas.width = canvas.height = 0
          }
          page.cleanup()
        }
      } finally { signal.removeEventListener('abort', cancelPdf); await task.destroy() }
    } else {
      for (const [index, image] of files.entries()) {
        const bitmap = await createImageBitmap(image)
        if (bitmap.width * bitmap.height > 40_000_000) { bitmap.close(); throw new Error('An image is too large to process safely. Resize it to under 40 megapixels.') }
        bitmap.close()
        pages.push(await recognize(image, index + 1))
      }
    }
    check(signal)
    if (pages.reduce((sum, page) => sum + page.text.length, 0) > 200_000) throw new Error('The document contains too much text. Upload a shorter proposal.')
    if (pages.every(page => !page.text.trim())) throw new Error('No readable text was found. Upload a clearer document or enter the draft manually.')
    return pages
  } catch (error) {
    check(signal)
    if (error instanceof Error && /password|encrypted/i.test(error.message)) throw new Error('Password-protected documents are not supported. Upload an unlocked copy.')
    throw error
  } finally { signal.removeEventListener('abort', stop); await terminateWorker() }
}
