import { activityDescription } from '../../features/activities/activityDescription'
import { ACTIVITY_LIFECYCLE_DISPLAY, getActivityLifecycleStatus, isActivityVisibleInCatalog } from '../../features/activities/activityLifecycle'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Search, MapPin, Calendar, Sparkles, Zap, Clock,
  UserPlus, ClipboardCheck, MessageCircle,
  HeartPulse, GraduationCap, Briefcase, HandHeart, Shield,
  Landmark, Vote, Leaf, Plane, Sprout,
  Mail, Phone, ArrowRight, ArrowUpRight,
} from 'lucide-react'
import { fetchPublicActivities } from '../../features/public/publicActivityService'
import type { PublicActivity } from '../../features/public/publicActivityService'
import ActivityModal from '../../features/public/ActivityModal'
import { autoCloseExpiredActivities } from '../../features/activities/activityService'
import { supabase } from '../../lib/supabase'
import logo from '../../assets/CYDO LOGO.jpg'
import LandingHero from './LandingHero'
import { usePageTitle } from '../../hooks/usePageTitle'
import './PublicLandingPage.css'

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
  usePageTitle('PCYDO PRIME')
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const observer = new ResizeObserver(() => {
      header.parentElement?.style.setProperty('--landing-header-height', `${header.getBoundingClientRect().height}px`)
    })
    observer.observe(header)
    return () => observer.disconnect()
  }, [])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [activities, setActivities] = useState<PublicActivity[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('activity'))
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [programFilter, setProgramFilter] = useState('')
  const [search, setSearch] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

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
      return mP && mQ && isActivityVisibleInCatalog(a, clockNow)
    })
  }, [activities, programFilter, search, clockNow])

  const totalSlots = activities.reduce((s, a) => s + a.slots, 0)
  const totalTaken = activities.reduce((s, a) => s + a.taken, 0)
  const programCount = new Set(activities.map((a) => a.programId)).size

  return (
    <div className="public-landing min-h-screen" style={{ background: 'var(--color-paper)' }}>
      <header ref={headerRef} className="landing-header bg-white border-b border-primary/10">
        <nav aria-label="Main navigation" className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <a href="#" className="flex items-center gap-3" aria-label="PRIME home">
            <img src={logo} alt="CYDO" className="w-11 h-11 rounded-full object-contain" />
            <div><div className="font-display text-xl font-extrabold" aria-label="PRIME"><span className="text-brand-red">P</span><span className="text-teal">R</span><span className="text-brand-gold">I</span><span className="text-primary">M</span><span className="text-brand-green">E</span></div><p className="text-[10px] text-gray-500">Panabo City Youth Development Office</p></div>
          </a>
          <div className="landing-nav-links flex gap-6 text-sm font-semibold text-gray-600">
            <a href="#activities-section" className="hover:text-primary">Activities</a>
            <a href="#how-it-works" className="hover:text-primary">How it works</a>
            <a href="#programs" className="hover:text-primary">Our programs</a>
          </div>
          <div className="flex items-center gap-4 text-sm font-bold">
            <button onClick={() => navigate('/admin/login')} className="text-primary">Log in</button>
            <button onClick={() => navigate('/signup')} className="rounded-full bg-primary px-5 py-2.5 text-white inline-flex items-center gap-2">Get started <ArrowUpRight size={16} /></button>
          </div>
        </nav>
      </header>
      <LandingHero />
      {/* Activity discovery */}
      <div id="activities-section" className="relative overflow-hidden text-white scroll-mt-6" style={{ background: 'var(--color-primary)' }}>
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

        <div className="relative max-w-5xl mx-auto px-6 pt-10 pb-2">

          <p className="text-accent text-[11px] font-bold uppercase tracking-[0.16em] mb-3">Find your next opportunity</p>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight mb-3">Show up. Get involved.</h2>
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
                aria-label="Search activities or venues"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search activities or venues..."
                className="w-full bg-white/[0.13] backdrop-blur-md border-none rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/45 focus:outline-none focus:bg-white/20 focus:ring-2 focus:ring-accent/50"
              />
            </div>
            <select
              aria-label="Filter activities by program"
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="filter-select filter-select-light bg-white/[0.13] backdrop-blur-md border-none rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:bg-white/20"
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
      <div className="max-w-5xl mx-auto px-6 py-8">
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
          <div className="space-y-9">
            {[...new Set(filtered.map(activity => activity.programName))].sort().map(program => {
              const programActivities = filtered.filter(activity => activity.programName === program)
              return <section key={program} aria-label={`${program} activities`}>
                <div className="flex items-center gap-3 mb-4 border-b border-primary/10 pb-3">
                  <span className="w-1 h-6 rounded-full bg-primary" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-primary">{program}</h2>
                  <span className="rounded-full bg-primary-light text-primary px-2.5 py-1 text-xs font-semibold whitespace-nowrap">{programActivities.length} {programActivities.length === 1 ? 'activity' : 'activities'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {programActivities.map((a) => {
              const open = Math.max(0, a.slots - a.taken)
              const isFull = open <= 0
              const lifecycle = getActivityLifecycleStatus(a, clockNow)
              const registrationClosed = lifecycle !== 'upcoming' || a.status === 'closed'
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
                    style={{ backgroundColor: a.colorBg || '#0756a0' }}
                  >
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,.06))' }} />
                    <Sparkles size={44} className="relative z-10 text-white/90 drop-shadow-lg" />

                    <span
                      className={'absolute top-2.5 right-2.5 z-20 px-2.5 py-1 rounded-full text-[10px] font-bold ' + ACTIVITY_LIFECYCLE_DISPLAY[lifecycle].cls}
                    >
                      {ACTIVITY_LIFECYCLE_DISPLAY[lifecycle].label}
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
                    <p className="text-sm text-gray-600 flex-1 mb-4 line-clamp-3">{activityDescription(a.previewDesc, a.fullDesc)}</p>

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

                      className="w-full btn-primary flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isFull || registrationClosed ? 'View Details' : 'View & Register'}
                    </button>
                  </div>
                </div>
              )
            })}
                </div>
              </section>
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
          {PILLARS.map((p, index) => (
            <div key={p.letter} data-brand={['red', 'teal', 'gold', 'green'][index]} className="brand-card panel p-5 text-center">
              <div className="brand-icon w-10 h-10 rounded-full bg-primary-light text-primary font-display font-extrabold text-lg flex items-center justify-center mx-auto mb-3">
                {p.letter}
              </div>
              <div className="font-bold text-gray-900 text-sm mb-1">{p.word}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div id="how-it-works" style={{ background: 'var(--color-primary-light)' }}>
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
                <div key={step.title} data-brand={['red', 'teal', 'gold', 'green'][i]} className="brand-card bg-white rounded-2xl border p-5 relative" style={{ borderColor: 'var(--brand-color)' }}>
                  <div className="brand-fill absolute -top-3 -left-3 w-7 h-7 rounded-full bg-accent text-white text-xs font-extrabold flex items-center justify-center shadow">
                    {i + 1}
                  </div>
                  <div className="brand-icon w-11 h-11 rounded-xl bg-primary-light text-primary flex items-center justify-center mb-4">
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
      <div id="programs" className="max-w-5xl mx-auto px-6 py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-bold uppercase tracking-wide text-primary mb-2">Our Programs</div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-gray-900">
            Ten focus areas for youth development
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {PROGRAMS.map((p, index) => {
            const Icon = p.icon
            return (
              <button
                key={p.name}
                data-brand={['red', 'teal', 'gold', 'blue', 'green'][index % 5]}
                onClick={() => {
                  setProgramFilter(p.name)
                  document.getElementById('activities-section')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="brand-card panel p-4 text-center hover:-translate-y-1 transition-transform"
              >
                <div className="brand-icon w-10 h-10 rounded-full bg-primary-light text-primary flex items-center justify-center mx-auto mb-2.5">
                  <Icon size={18} />
                </div>
                <div className="text-xs font-semibold text-gray-700 leading-tight">{p.name}</div>
              </button>
            )
          })}
        </div>
      </div>

      <section className="max-w-5xl mx-auto px-6 py-8">
        <div data-brand="green" className="brand-community-cta rounded-3xl bg-primary-light p-8 sm:p-12 flex flex-wrap items-center justify-between gap-6">
          <div><p className="text-primary uppercase text-[11px] tracking-[0.16em] font-bold mb-3">Your community is waiting</p><h2 className="font-display text-3xl font-extrabold text-primary-dark">Be part of what comes next.</h2><p className="text-sm text-gray-600 mt-3">Create your account and take your first step with CYDO.</p></div>
          <button onClick={() => navigate('/signup')} className="bg-primary text-white rounded-full px-6 py-3.5 text-sm font-bold inline-flex items-center gap-3">Create an account <ArrowRight size={18} /></button>
        </div>
      </section>
      {/* Footer */}
      <footer className="text-white mt-8" style={{ background: 'var(--color-primary-dark, #063568)' }}>
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-1 sm:grid-cols-3 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-white/95 flex items-center justify-center p-1.5 shrink-0">
                <img src={logo} alt="CYDO Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="font-display font-extrabold text-sm">PCYDO MEAL System</div>
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
              <span>3rd Floor, New City Hall Building, Barangay JP Laurel, Panabo City, Davao del Norte</span>
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
