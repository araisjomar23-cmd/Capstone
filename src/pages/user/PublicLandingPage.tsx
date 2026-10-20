import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, MapPin, Calendar, Sparkles, Zap, Clock,
  UserPlus, ClipboardCheck, MessageCircle,
  HeartPulse, GraduationCap, Briefcase, HandHeart, Shield,
  Landmark, Vote, Leaf, Plane, Sprout,
  Mail, Phone,
} from 'lucide-react'
import { fetchPublicActivities } from '../../features/public/publicActivityService'
import type { PublicActivity } from '../../features/public/publicActivityService'
import ActivityModal from '../../features/public/ActivityModal'
import { autoCloseExpiredActivities } from '../../features/activities/activityService'
import { supabase } from '../../lib/supabase'
import logo from '../../assets/CYDO LOGO.jpg'

const PROGRAMS = [
  { name: 'Health', icon: HeartPulse },
  { name: 'Education', icon: GraduationCap },
  { name: 'Economic Empowerment', icon: Briefcase },
  { name: 'Social Inclusion and Equity', icon: HandHeart },
  { name: 'Peace Building and Security', icon: Shield },
  { name: 'Governance', icon: Landmark },
  { name: 'Active Citizenship', icon: Vote },
  { name: 'Environment', icon: Leaf },
  { name: 'Global Mobility', icon: Plane },
  { name: 'Agriculture', icon: Sprout },
]

const PILLARS = [
  { letter: 'M', word: 'Monitoring', desc: 'Tracking youth activities and participation as they happen.' },
  { letter: 'E', word: 'Evaluation', desc: 'Measuring outcomes and impact against program goals.' },
  { letter: 'A', word: 'Accountability', desc: 'Transparent reporting for CYDO, partners, and the community.' },
  { letter: 'L', word: 'Learning', desc: 'Using feedback and data to continuously improve programs.' },
]

const STEPS = [
  { icon: UserPlus, title: 'Create Your Account', desc: 'Sign up with your email and complete your youth profile.' },
  { icon: Search, title: 'Browse Activities', desc: 'Explore programs and events happening across Panabo City.' },
  { icon: ClipboardCheck, title: 'Register for a Slot', desc: 'Reserve your spot and get a reference code instantly.' },
  { icon: MessageCircle, title: 'Attend & Give Feedback', desc: 'Join the activity, then help us improve with your evaluation.' },
]

function fmtShort(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

function PublicLandingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activities, setActivities] = useState<PublicActivity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('activity'))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    load()

    const channel = supabase
      .channel(`public-activities-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'legacy_activities' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => load())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      await autoCloseExpiredActivities()
      const data = await fetchPublicActivities()
      setActivities(data)
    } catch (error) {
      setActivities([])
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return activities.filter((a) => {
      const mP = !programFilter || a.programName === programFilter
      const mQ = !q || a.title.toLowerCase().includes(q) || a.venue.toLowerCase().includes(q)
      return mP && mQ
    })
  }, [activities, programFilter, search])

  const totalSlots = activities.reduce((s, a) => s + a.slots, 0)
  const totalTaken = activities.reduce((s, a) => s + a.taken, 0)
  const programCount = new Set(activities.map((a) => a.programId)).size

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-paper)' }}>
      {/* Hero */}
      <div className="relative overflow-hidden text-white" style={{ background: 'var(--color-primary)' }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 65% 90% at 95% -5%, rgba(232,160,32,.22) 0%, transparent 65%), radial-gradient(ellipse 45% 60% at -5% 110%, rgba(46,125,90,.28) 0%, transparent 55%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 pt-6 flex items-center justify-between">
          <div className="font-display text-lg font-extrabold tracking-tight">
            CYDO <span className="text-accent">MEAL</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/login')}
              className="text-sm font-semibold text-white/80 hover:text-white transition-colors"
            >
              Log In
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="text-sm font-semibold bg-accent text-primary-dark px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Sign Up
            </button>
          </div>
        </div>

        <div className="relative max-w-5xl mx-auto px-6 pt-10 pb-2">

          <h1 className="font-display text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight mb-3">
            CYDO <span className="text-accent">MEAL</span> System
          </h1>
          <p className="text-white/70 max-w-md leading-relaxed mb-7">
            Browse and register for youth development activities happening across Panabo City.
          </p>

          <div className="inline-flex bg-white/10 border border-white/15 rounded-2xl overflow-hidden mb-8">
            <div className="px-5 py-3 text-center border-r border-white/10">
              <div className="font-display text-xl font-extrabold text-accent leading-none mb-0.5">
                {fmtShort(activities.length)}
              </div>
              <div className="text-[10px] text-white/60">Activities</div>
            </div>
            <div className="px-5 py-3 text-center border-r border-white/10">
              <div className="font-display text-xl font-extrabold text-accent leading-none mb-0.5">
                {fmtShort(Math.max(0, totalSlots - totalTaken))}
              </div>
              <div className="text-[10px] text-white/60">Open Slots</div>
            </div>
            <div className="px-5 py-3 text-center">
              <div className="font-display text-xl font-extrabold text-accent leading-none mb-0.5">
                {fmtShort(programCount)}
              </div>
              <div className="text-[10px] text-white/60">Programs</div>
            </div>
          </div>

          {/* Glass search bar */}
          <div className="flex flex-wrap gap-2.5 max-w-2xl mb-10">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activities or venues..."
                className="w-full bg-white/[0.13] backdrop-blur-md border-none rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:bg-white/20 focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="bg-white/[0.13] backdrop-blur-md border-none rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:bg-white/20"
              style={{ colorScheme: 'dark' }}
            >
              <option value="" className="text-black">All Programs</option>
              {PROGRAMS.map((p) => (
                <option key={p.name} value={p.name} className="text-black">{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Wave divider */}
        <div className="relative leading-[0]">
          <svg viewBox="0 0 1440 52" fill="none" preserveAspectRatio="none" className="w-full block">
            <path
              d="M0 52V28C120 10 240 2 360 8 480 14 600 38 720 40 840 42 960 24 1080 14 1200 4 1320 8 1440 20V52H0Z"
              fill="var(--color-paper)"
            />
          </svg>
        </div>
      </div>

      {/* Cards */}
      <div id="activities-section" className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-sm text-gray-500 mb-5">
          {loading ? 'Loading…' : loadError ? 'Activities could not be loaded' : `${filtered.length} ${filtered.length === 1 ? 'activity' : 'activities'} found`}
        </p>

        {loading ? (
          <div className="text-center text-gray-400 py-16">Loading activities…</div>
        ) : loadError ? (
          <div role="alert" className="text-center text-red-700 py-10">
            <p>{loadError}</p>
            <button type="button" className="btn-primary mt-4" onClick={() => void load()}>Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 py-16">No activities found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a) => {
              const open = Math.max(0, a.slots - a.taken)
              const isFull = open <= 0
              const isUrgent = !isFull && a.slots > 0 && open / a.slots <= 0.15

              return (
                <div
                  key={a.id}
                  className="bg-white rounded-2xl border overflow-hidden flex flex-col cursor-pointer transition-all hover:-translate-y-1.5"
                  style={{
                    borderColor: 'var(--color-border-warm)',
                    boxShadow: '0 2px 16px rgba(26,92,58,.07)',
                  }}
                  onClick={() => setSelectedId(a.id)}
                >
                  <div
                    className="h-[140px] relative flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: a.colorBg || '#1a5c3a' }}
                  >
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,.06))' }} />
                    <Sparkles size={44} className="relative z-10 text-white/90 drop-shadow-lg" />

                    <span
                      className="absolute top-2.5 right-2.5 z-20 px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-sm"
                      style={{
                        background: a.status === 'open' ? 'rgba(212,240,224,.92)' : a.status === 'upcoming' ? 'rgba(220,238,255,.92)' : 'rgba(253,232,200,.92)',
                        color: a.status === 'open' ? '#1a5c3a' : a.status === 'upcoming' ? '#1a4d7a' : '#9a5f0a',
                      }}
                    >
                      {a.status}
                    </span>

                    {isUrgent && (
                      <span className="urgency-badge absolute top-2.5 left-2.5 z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold text-white bg-red-600">
                        <Zap size={10} /> Almost Full
                      </span>
                    )}
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">{a.programName}</div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">{a.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
                      <span className="inline-flex items-center gap-1"><Calendar size={12} /> {a.date}</span>
                      {a.time && <span className="inline-flex items-center gap-1"><Clock size={12} /> {a.time}</span>}
                      <span className="inline-flex items-center gap-1"><MapPin size={12} /> {a.venue}</span>
                    </div>
                    <p className="text-sm text-gray-600 flex-1 mb-4 line-clamp-3">{a.previewDesc}</p>

                    <div className="mb-3">
                      <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
                        <span>{isFull ? 'Full' : `${open} slot${open === 1 ? '' : 's'} left`}</span>
                        <span>{a.taken}/{a.slots}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${a.slots > 0 ? Math.min(100, (a.taken / a.slots) * 100) : 0}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedId(a.id)
                      }}
                      disabled={isFull}
                      className="w-full btn-primary flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isFull ? 'Activity Full' : <>View & Register</>}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* About / What is MEAL */}
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">What is MEAL?</div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
            Built by the City Youth Development Office of Panabo City
          </h2>
          <p className="text-gray-500 leading-relaxed">
            The PRIME MEAL System helps CYDO plan, run, and improve youth development programs across
            Panabo City — giving every young participant an easy way to discover activities, register,
            and be heard.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {PILLARS.map((p) => (
            <div key={p.letter} className="panel p-5 text-center">
              <div className="w-10 h-10 rounded-full bg-primary-light text-primary font-display font-extrabold text-lg flex items-center justify-center mx-auto mb-3">
                {p.letter}
              </div>
              <div className="font-bold text-gray-900 text-sm mb-1">{p.word}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div style={{ background: 'var(--color-primary-light)' }}>
        <div className="max-w-5xl mx-auto px-6 py-14">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">How It Works</div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-900">
              Four steps to get involved
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              return (
                <div key={step.title} className="bg-white rounded-2xl border p-5 relative" style={{ borderColor: 'var(--color-border-warm)' }}>
                  <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-accent text-white text-xs font-extrabold flex items-center justify-center shadow">
                    {i + 1}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-primary-light text-primary flex items-center justify-center mb-4">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1.5">{step.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Programs showcase */}
      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">Our Programs</div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-900">
            Ten focus areas for youth development
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {PROGRAMS.map((p) => {
            const Icon = p.icon
            return (
              <button
                key={p.name}
                onClick={() => {
                  setProgramFilter(p.name)
                  document.getElementById('activities-section')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="panel p-4 text-center hover:-translate-y-1 transition-transform"
              >
                <div className="w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center mx-auto mb-2.5">
                  <Icon size={18} />
                </div>
                <div className="text-xs font-semibold text-gray-700 leading-tight">{p.name}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-white mt-8" style={{ background: 'var(--color-primary-dark, #0f4429)' }}>
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 sm:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-white/95 flex items-center justify-center p-1.5 shrink-0">
                <img src={logo} alt="CYDO Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="font-display font-extrabold text-sm">CYDO MEAL System</div>
                <div className="text-white/50 text-[11px]">Panabo City Government</div>
              </div>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">
              Monitoring, Evaluation, Accountability, and Learning for youth development programs
              across Panabo City.
            </p>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-3">Quick Links</div>
            <div className="flex flex-col gap-2 text-sm">
              <button onClick={() => document.getElementById('activities-section')?.scrollIntoView({ behavior: 'smooth' })} className="text-white/70 hover:text-white text-left">
                Browse Activities
              </button>
              <button onClick={() => navigate('/signup')} className="text-white/70 hover:text-white text-left">
                Create an Account
              </button>
              <button onClick={() => navigate('/admin/login')} className="text-white/70 hover:text-white text-left">
                Log In
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-white/40 mb-3">Contact CYDO</div>
            <div className="flex flex-col gap-2 text-sm text-white/70">
              <a
                href="https://maps.app.goo.gl/6ue339w8yAk7AVLe8"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:text-white transition-colors"
              >
              <MapPin size={14} className="text-white/40"/>
              <span>Barangay JP Laurel, Panabo City, Davao del Norte</span>
              </a>

              <span className="inline-flex items-center gap-2"><Phone size={14} className="text-white/40" /> (084) 000-0000</span>
              <span className="inline-flex items-center gap-2"><Mail size={14} className="text-white/40" /> cydo@panabocity.gov.ph</span>

              <a 
               href="https://www.facebook.com/profile.php?id=100090102912449"
               target="_blank"
               rel="noopener noreferrer"
               className="inline-flex items-center gap-2 hover:text-white transition-colors"
               >
              <span className="text-white/70 font-bold">f</span>
              <span>Panabo City Youth Development Office</span>
              </a>

            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-5xl mx-auto px-6 py-4 text-center text-xs text-white/40">
            © {new Date().getFullYear()} PRIME: MEAL System — City Youth Development Office, Panabo City. All rights reserved.
          </div>
        </div>
      </footer>

      {selectedId && (
        <ActivityModal
          activityId={selectedId}
          onClose={() => {
            setSelectedId(null)
            load()
          }}
        />
      )}
    </div>
  )
}

export default PublicLandingPage
