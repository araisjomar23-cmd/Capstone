import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function EligibilityReviewPanel({ refreshKey }: { refreshKey: string }) {
  const [rows, setRows] = useState<{ registration_id: string; reason: string; name: string; ref_code: string }[]>([])
  const [notes, setNotes] = useState<Record<string,string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      const result = await supabase.from('registration_eligibility_reviews').select('registration_id,reason').eq('resolved',false).is('reviewed_at',null).order('detected_at',{ascending:false})
      if (result.error) { if (active) setError('Unable to load eligibility review flags.'); return }
      const ids = (result.data ?? []).map(row => row.registration_id)
      const details = ids.length ? await supabase.from('registration_details').select('id,name,ref_code').in('id',ids) : {data:[],error:null}
      if (details.error) { if (active) setError('Unable to load flagged registration details.'); return }
      if (active) { setError(''); setRows((result.data ?? []).map(row => ({...row,...(details.data ?? []).find(detail => detail.id === row.registration_id),name:(details.data ?? []).find(detail => detail.id === row.registration_id)?.name || 'Participant',ref_code:(details.data ?? []).find(detail => detail.id === row.registration_id)?.ref_code || ''}))) }
    }
    void load()
    return () => { active = false }
  }, [refreshKey,version])
  if (!rows.length && !error) return null
  return <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle size={18} />Registration eligibility review · {rows.length}</h2><p className="mt-1 text-xs text-amber-800">Schedule changes affected these registrations. No registration has been automatically cancelled.</p>{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}<div className="mt-3 space-y-3">{rows.map(row => <div key={row.registration_id} className="rounded-lg bg-white p-3"><p className="text-xs font-semibold text-gray-800">{row.name} · {row.ref_code}</p><p className="mt-1 text-xs text-gray-600">{row.reason}</p><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input aria-label={`Review note for ${row.ref_code}`} className="input" placeholder="Record your review and follow-up action" value={notes[row.registration_id] || ''} onChange={event => setNotes(previous => ({...previous,[row.registration_id]:event.target.value}))} /><button type="button" disabled={!!busy || !notes[row.registration_id]?.trim()} className="btn-primary shrink-0 text-xs disabled:opacity-40" onClick={async () => { setBusy(row.registration_id); const {error} = await supabase.from('registration_eligibility_reviews').update({reviewed_at:new Date().toISOString(),review_note:notes[row.registration_id].trim()}).eq('registration_id',row.registration_id); setBusy(''); if(error) setError('Unable to record this review. Please retry.'); else setVersion(value => value+1) }}>Record review</button></div></div>)}</div></section>
}
