import type { ProgramSummary } from './useDashboardData'

export default function ProgramOverview({ rows = [] }: { rows?: ProgramSummary[] }) {
  return <section className="panel mb-4 min-w-0 !p-4 sm:!p-5" aria-labelledby="dashboard-programs-title">
    <h2 id="dashboard-programs-title" className="text-sm font-semibold text-gray-800">Program performance</h2>
    <p className="mt-1 text-xs text-gray-500">Programs with activities in the selected period. Registrations count participation in each activity; the same youth may join more than once.</p>
    {!rows.length ? <p className="py-8 text-center text-sm text-gray-500">No program activity in this period.</p> :
      <div role="region" aria-label="Program performance table" tabIndex={0} className="mt-4 max-w-full overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full min-w-[42rem] text-left text-xs">
          <thead className="bg-gray-50 text-gray-600"><tr>{['Program', 'Activities', 'Registrations', 'Attended', 'Remaining budget', 'Satisfaction'].map(label => <th key={label} scope="col" className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">{rows.map(row => <tr key={row.id}>
            <th scope="row" className="max-w-64 whitespace-normal break-words px-3 py-3 font-semibold text-gray-800">{row.name}</th>
            <td className="px-3 py-3">{row.activities}</td><td className="px-3 py-3">{row.registrations}</td><td className="px-3 py-3">{row.attended}</td>
            <td className={`whitespace-nowrap px-3 py-3 ${row.allocated - row.spent < 0 ? 'font-semibold text-red-700' : 'text-gray-700'}`}>PHP {(row.allocated - row.spent).toLocaleString('en-PH')}{row.spent > row.allocated && <span className="block text-[10px]">Over budget</span>}</td>
            <td className="whitespace-nowrap px-3 py-3">{row.responses ? `${(row.ratingTotal / row.responses).toFixed(1)} / 5` : 'No responses'}<span className="block text-[10px] text-gray-500">{row.responses} responses</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>
}
