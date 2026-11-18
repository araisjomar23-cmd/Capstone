import type { PublicActivity } from './publicActivityService'

export default function ActivityPlanDetails({ activity }: { activity: PublicActivity }) {
  const sections = [
    { title: 'Objectives', items: activity.objectives ?? [] },
    { title: 'Expected outputs', items: activity.outcomes },
    { title: 'Implementation schedule', items: activity.schedule },
  ]
  return <>{sections.filter(section => section.items.some(item => item.trim())).map(section => <section key={section.title} className="mb-5"><h2 className="mb-2 text-base font-bold text-gray-900">{section.title}</h2><ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-gray-700">{section.items.filter(item => item.trim()).map((item,index) => <li key={index} className="whitespace-pre-wrap break-words">{item}</li>)}</ul></section>)}</>
}
