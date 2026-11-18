import { supabase } from '../../lib/supabase'
import { emptyProposal, matchProgram, validateUploadSet, type Extraction, type Proposal, type ProposalDocument, type ProposalFields } from './proposalModel'
import { parseProposal } from './parseProposal'

export async function listProposals() {
  const { data, error } = await supabase.from('ppa_proposals').select('*').order('updated_at', { ascending: false })
  if (error) throw new Error('Unable to load PPA proposals: ' + error.message)
  return (data ?? []) as Proposal[]
}
export async function getProposal(id: string) {
  const [proposal, documents, history] = await Promise.all([
    supabase.from('ppa_proposals').select('*').eq('id', id).single(),
    supabase.from('ppa_documents').select('*').eq('proposal_id', id).order('version', { ascending: false }),
    supabase.from('ppa_publications').select('id,revision,document_version,published_at').eq('proposal_id', id).order('published_at', { ascending: false }),
  ])
  if (proposal.error || documents.error || history.error) throw new Error('Unable to load the proposal and its version history. Please retry.')
  return { proposal: proposal.data as Proposal, documents: documents.data as ProposalDocument[], history: history.data ?? [] }
}
export async function importProposal(files: File[], signal: AbortSignal, progress: (message: string) => void, replacing?: Proposal) {
  validateUploadSet(files)
  const { fingerprintFiles, readProposal } = await import('./readProposal')
  progress('Checking for an existing proposal…')
  const fingerprint = await fingerprintFiles(files)
  const { data: duplicate, error: lookupError } = await supabase.from('ppa_documents').select('proposal_id').eq('fingerprint', fingerprint).maybeSingle()
  if (lookupError) throw new Error('Unable to check for duplicate proposals. Please retry.')
  if (duplicate) return { id: duplicate.proposal_id as string, duplicate: true }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')
  const uploaded: ProposalDocument['files'] = []
  try {
    for (const file of files) {
      if (signal.aborted) throw new DOMException('Upload cancelled.', 'AbortError')
      const extension = file.name.split('.').pop()!.toLowerCase()
      const type = extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg'
      const path = `${user.id}/${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`
      progress(`Saving signed source: ${file.name}`)
      const { error } = await supabase.storage.from('ppa-documents').upload(path, file, { contentType: type, upsert: false })
      if (error) throw new Error('Unable to store the signed document: ' + error.message)
      uploaded.push({ path, name: file.name, size: file.size, type })
    }
    let fields = structuredClone(emptyProposal)
    let extraction: Extraction
    try {
      const result = parseProposal(await readProposal(files, signal, progress))
      fields = result.fields; extraction = result.extraction
    } catch (error) {
      if (signal.aborted || /password|20 pages|processing limit|not contain a valid|not a readable|too large|too much text/i.test(error instanceof Error ? error.message : '')) throw error
      extraction = { pages: [], sources: {}, warnings: ['Automatic reading failed. The original files were retained. Retry extraction or complete the draft manually.', error instanceof Error ? error.message : 'Unreadable document.'] }
    }
    const { data: programs } = await supabase.from('programs').select('id,name')
    fields.programId = matchProgram(fields.programType, programs ?? [])
    if (signal.aborted) throw new DOMException('Upload cancelled.','AbortError')
    const { data: id, error } = await supabase.rpc('import_ppa_document', {
      p_proposal: replacing?.id ?? null, p_revision: replacing?.revision ?? null, p_fingerprint: fingerprint,
      p_files: uploaded, p_extraction: { ...extraction, suggestedFields: fields }, p_fields: fields,
    })
    if (error || !id) throw new Error(error?.message ?? 'Unable to create the activity draft.')
    // This also removes orphaned objects if another upload won the duplicate race.
    // The bucket policy protects files already attached to a saved document.
    await supabase.storage.from('ppa-documents').remove(uploaded.map(file => file.path))
    return { id: String(id), duplicate: false }
  } catch (error) {
    if (uploaded.length) await supabase.storage.from('ppa-documents').remove(uploaded.map(file => file.path))
    throw error
  }
}
export async function saveProposal(proposal: Proposal, fields: ProposalFields) {
  const { data, error } = await supabase.rpc('save_ppa_draft', { p_id: proposal.id, p_revision: proposal.revision, p_fields: fields })
  if (error) throw new Error(error.message)
  return data as Proposal
}
export async function publishProposal(proposal: Proposal) {
  const { data, error } = await supabase.rpc('publish_ppa_proposal', { p_id: proposal.id, p_revision: proposal.revision, p_approval_confirmed: true, p_review_confirmed: true })
  if (error) throw new Error(error.message)
  return String(data)
}
export async function createProposalProgram(name: string) {
  const { data, error } = await supabase.rpc('ensure_ppa_program', { p_name: name })
  if (error) throw new Error(error.message)
  return String(data)
}
export async function documentUrl(path: string) {
  const { data, error } = await supabase.storage.from('ppa-documents').createSignedUrl(path, 600)
  if (error) throw new Error('Unable to open the signed source. Please retry.')
  return data.signedUrl
}
export async function retryExtraction(proposal: Proposal, document: ProposalDocument, signal: AbortSignal, progress: (message: string) => void, forceOcr: boolean) {
  const files: File[] = []
  for (const item of document.files) {
    const response = await fetch(await documentUrl(item.path), { signal })
    if (!response.ok) throw new Error('Unable to download the original document for reprocessing.')
    files.push(new File([await response.blob()], item.name, { type: item.type }))
  }
  const { readProposal } = await import('./readProposal')
  const result = parseProposal(await readProposal(files, signal, progress, forceOcr))
  const { data, error } = await supabase.rpc('retry_ppa_extraction', { p_id: proposal.id, p_revision: proposal.revision, p_extraction: { ...result.extraction, suggestedFields: result.fields } })
  if (error) throw new Error(error.message)
  return data
}
