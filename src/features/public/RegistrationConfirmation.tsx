import { Calendar, CheckCircle2, Clock, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PublicActivity } from './publicActivityService'

export default function RegistrationConfirmation({ activity, refCode, onBrowse }: {
  activity: PublicActivity
  refCode: string
  onBrowse: () => void
}) {
  return (
    <div className="p-6 sm:p-8 text-center">
      <CheckCircle2 size={48} className="mx-auto mb-4 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Registration successful</h1>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">{activity.title}</p>
      <dl className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left space-y-3 mb-5 text-sm">
        <div className="flex gap-3"><Calendar size={17} className="text-primary shrink-0 mt-0.5" /><div><dt className="text-xs text-gray-500">Date</dt><dd className="font-medium text-gray-800">{activity.date || 'To be announced'}</dd></div></div>
        {activity.time && <div className="flex gap-3"><Clock size={17} className="text-primary shrink-0 mt-0.5" /><div><dt className="text-xs text-gray-500">Time</dt><dd className="font-medium text-gray-800">{activity.time}</dd></div></div>}
        <div className="flex gap-3"><MapPin size={17} className="text-primary shrink-0 mt-0.5" /><div><dt className="text-xs text-gray-500">Venue</dt><dd className="font-medium text-gray-800">{activity.venue || 'To be announced'}</dd></div></div>
      </dl>
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
        <p className="text-xs text-gray-600 mb-2">Your reference code</p>
        <p className="text-xl sm:text-2xl font-bold text-primary tracking-wider break-all">{refCode}</p>
        <p className="text-xs text-gray-500 mt-2">Keep this for staff assistance.</p>
      </div>
      <div className="text-left mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-2">What happens next?</h2>
        <p className="text-sm text-gray-600 leading-relaxed">On activity day, follow your facilitator’s instructions. Scan the activity’s Attendance &amp; Evaluation QR when provided, then complete the evaluation to record your attendance.</p>
      </div>
      <Link to="/participant/my-activities" className="btn-primary w-full min-h-11 flex items-center justify-center">View My Activities</Link>
      <button type="button" onClick={onBrowse} className="text-primary font-semibold text-sm mt-3 min-h-11 px-4">Browse More Activities</button>
    </div>
  )
}
