import { useEffect, useState } from 'react'
import { Users, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function ActivityDeliveryDetails({ activityId }: { activityId: string }) {
  const [details, setDetails] = useState<{ facilitators: string[]; allocated_budget: number | string } | null>(null)
  const [error, setError] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let active = true
    setDetails(null)
    setError(false)
    setSignedIn(false)
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!active || !user) return
        setSignedIn(true)
        const { data, error: cause } = await supabase.rpc('get_activity_delivery_details', { p_activity_id: activityId })
        if (!active) return
        if (cause || !data?.[0]) { setError(true); return }
        setDetails(data[0])
      } catch { if (active) setError(true) }
    })()
    return () => { active = false }
  }, [activityId])
  if (!signedIn) return null
  if (error) return <p role="status" className="text-sm text-gray-700 mb-5">Facilitator and budget details could not be loaded. Please refresh to try again.</p>
  if (!details) return <p role="status" className="text-sm text-gray-700 mb-5">Loading facilitator and budget details…</p>
  return <dl className="grid sm:grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6">
    <div><dt className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2"><Users size={17} className="text-primary" /> Assigned facilitators</dt>
      <dd className="text-base text-gray-800">{details.facilitators.length ? <ul className="space-y-1">{details.facilitators.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul> : 'No facilitators assigned yet'}</dd></div>
    <div><dt className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2"><Wallet size={17} className="text-primary" /> Allocated budget</dt>
      <dd className="text-lg font-bold text-primary">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(Number(details.allocated_budget))}</dd></div>
  </dl>
}
