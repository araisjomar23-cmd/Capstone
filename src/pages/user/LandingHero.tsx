import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, GraduationCap, HandHeart, Pause, Play, Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'

const SLIDES = [
  {
    image: '/images/landing/learn.jpg',
    label: 'LEARN & GROW',
    title: 'Your next chapter',
    highlight: 'starts here.',
    description: 'Discover new skills, explore your potential, and take your next step with youth development opportunities across Panabo City.',
    caption: 'Make room for new possibilities.',
    position: 'center 45%',
  },
  {
    image: '/images/landing/community.jpg',
    label: 'CONNECT & BELONG',
    title: 'Find your people.',
    highlight: 'Build your future.',
    description: 'Meet people who share your passion. Join activities, exchange ideas, and grow with a community that believes in you.',
    caption: 'Good things begin with connection.',
    position: 'center 50%',
  },
  {
    image: '/images/landing/volunteer.jpg',
    label: 'SHOW UP & MAKE A DIFFERENCE',
    title: 'Small steps.',
    highlight: 'Lasting impact.',
    description: 'Bring your energy to something meaningful. Get involved, give back, and help shape a brighter future for your community.',
    caption: 'A little of your time. A world of possibility.',
    position: 'center 50%',
  },
]

export default function LandingHero() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (paused || interacting || reducedMotion) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(value => (value + 1) % SLIDES.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [paused, interacting, reducedMotion, active])

  function selectSlide(index: number) {
    setActive((index + SLIDES.length) % SLIDES.length)
  }

  return (
    <>
      <section
        className="landing-slideshow"
        data-brand={['blue', 'teal', 'green'][active]}
        aria-label="Discover opportunities with PRIME"
        aria-roledescription="carousel"
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocusCapture={() => setInteracting(true)}
        onBlurCapture={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false)
        }}
      >
        <div className="landing-slide-images" aria-hidden="true">
          {SLIDES.map((slide, index) => (
            <img key={slide.image} src={slide.image} alt="" className={index === active ? 'is-active' : ''} style={{ objectPosition: slide.position }} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async" />
          ))}
        </div>
        <div className="landing-slide-shade" />
        <div className="landing-slide-inner">
          <p className="landing-slide-eyebrow"><span /> PANABO CITY YOUTH DEVELOPMENT OFFICE</p>
          <div className="landing-slide-copy" aria-live={paused || interacting || reducedMotion ? 'polite' : 'off'} aria-atomic="true">
            {SLIDES.map((slide, index) => (
              <div key={slide.label} className={`landing-slide${index === active ? ' is-active' : ''}`} aria-hidden={index !== active} inert={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${SLIDES.length}`}>
                <p className="landing-slide-category">{slide.label}</p>
                <h1>{slide.title}<br /><span>{slide.highlight}</span></h1>
                <p className="landing-slide-description">{slide.description}</p>
              </div>
            ))}
          </div>
          <div className="landing-slide-actions">
            <a href="#activities-section" className="landing-slide-primary">Explore activities <ArrowRight size={18} /></a>
            <Link to="/signup" className="landing-slide-secondary">Join the community <ArrowUpRight size={17} /></Link>
          </div>
          <div className="landing-slide-bottom">
            <div className="landing-slide-note"><span className="landing-slide-note-line" /><div><strong>GROW. CONNECT. CONTRIBUTE.</strong><div className="landing-slide-captions">{SLIDES.map((slide, index) => <p key={slide.label} className={index === active ? 'is-active' : ''} aria-hidden={index !== active}>{slide.caption}</p>)}</div></div></div>
            <div className="landing-slide-controls" role="group" aria-label="Slideshow controls">
              <span className="landing-slide-count">0{active + 1}<span> / 0{SLIDES.length}</span></span>
              <button type="button" onClick={() => selectSlide(active - 1)} aria-label="Previous slide"><ChevronLeft size={18} /></button>
              <div className="landing-slide-dots">
                {SLIDES.map((slide, index) => <button type="button" key={slide.label} className={index === active ? 'is-active' : ''} aria-label={`Show slide ${index + 1}: ${slide.label.toLowerCase()}`} aria-current={index === active ? 'true' : undefined} onClick={() => selectSlide(index)}><span /></button>)}
              </div>
              <button type="button" onClick={() => selectSlide(active + 1)} aria-label="Next slide"><ChevronRight size={18} /></button>
              {!reducedMotion && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>}
            </div>
          </div>
          <p className="landing-photo-note">Illustrative photography · Unsplash</p>
        </div>
      </section>
      <div className="landing-community-band">
        <div className="landing-trust-strip"><span>YOUR CITY. YOUR COMMUNITY. YOUR FUTURE.</span><span><GraduationCap size={19} /> Build your skills</span><span><HandHeart size={19} /> Find your community</span><span><Sprout size={19} /> Make a difference</span></div>
      </div>
    </>
  )
}
