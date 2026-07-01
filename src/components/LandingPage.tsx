import { useEffect, useState } from 'react'
import { Check, CalendarDays, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PricingView } from './PricingView'
import './LandingPage.css'

export function LandingPage({
  onNavigate,
  billingStatus,
  billingPlanLoading,
  isLoggedIn = false,
  dashboardPath = '/app/dashboard',
}: {
  onNavigate: (path: string) => void
  billingStatus: string
  billingPlanLoading: string
  isLoggedIn?: boolean
  dashboardPath?: string
}) {
  const [sessionLoggedIn, setSessionLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    if (!supabase) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSessionLoggedIn(Boolean(data.session))
    })

    return () => {
      mounted = false
    }
  }, [isLoggedIn])

  const hasSession = sessionLoggedIn ?? isLoggedIn

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </div>
          ShipCheck
        </div>
        <div className="landing-nav-links">
          <a onClick={scrollToPricing}>Pricing</a>
          {hasSession ? (
            <button className="button primary" onClick={() => onNavigate(dashboardPath)}>
              Go to Dashboard
            </button>
          ) : (
            <>
              <a onClick={() => onNavigate('/login')}>Sign In</a>
              <button className="button primary" onClick={() => onNavigate('/signup')}>
                Get Started
              </button>
            </>
          )}
        </div>
      </nav>

      {hasSession && (
        <div className="landing-return-banner">
          <span>You are logged in.</span>
          <button type="button" onClick={() => onNavigate(dashboardPath)}>
            Go to Dashboard
          </button>
        </div>
      )}

      <header className="landing-hero">
        <h1>Know what to ship. Know what to cut. Know when you launch.</h1>
        <p>
          ShipCheck helps builders and small teams control scope, log real progress, forecast launch dates, and catch scope creep before it becomes burnout.
        </p>
        <div className="landing-cta-group">
          <button className="button primary" onClick={() => onNavigate(hasSession ? dashboardPath : '/signup')}>
            {hasSession ? 'Go to Dashboard' : 'Get Started Free'}
          </button>
          <button className="button secondary" onClick={scrollToHowItWorks}>
            See how it works
          </button>
        </div>

        <div className="landing-visual-mockup">
          <div className="mockup-panel">
            <div className="mockup-header">
              <span className="mockup-header-title">Ship Scope</span>
              <span className="mockup-pill">60h left</span>
            </div>
            <div className="mockup-card">
              <div className="mockup-card-title">Core dashboard UI</div>
              <div className="mockup-card-meta">
                <span>In progress</span>
                <span>8h est</span>
              </div>
            </div>
            <div className="mockup-card">
              <div className="mockup-card-title">Billing webhooks</div>
              <div className="mockup-card-meta">
                <span>Not started</span>
                <span>4h est</span>
              </div>
            </div>
          </div>
          
          <div className="mockup-panel" style={{ backgroundColor: 'var(--color-cloud)' }}>
            <div className="mockup-header">
              <span className="mockup-header-title">Launch Forecast</span>
            </div>
            <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '8px', borderLeft: '4px solid var(--color-harbor)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-slate)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>On Track</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', marginBottom: '8px' }}>Oct 14</div>
              <div style={{ fontSize: '14px', color: 'var(--color-slate)' }}>Based on 12h/week actual velocity.</div>
            </div>
          </div>
        </div>
      </header>

      <section id="how-it-works" className="landing-section">
        <h2 className="landing-section-title">How ShipCheck works</h2>
        <div className="how-it-works-grid">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Define your launch scope</h3>
            <p>List exactly what must exist to launch. Everything else goes to the Later or Cut columns.</p>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>Log your daily progress</h3>
            <p>Log time spent and blockers in under 60 seconds each day. Keep your momentum visible.</p>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>Know exactly when you ship</h3>
            <p>Stop guessing. See a realistic launch date continuously updated by your actual velocity.</p>
          </div>
        </div>
      </section>

      <section className="landing-section" style={{ backgroundColor: 'var(--color-white)', borderRadius: '24px', padding: '60px 5%' }}>
        <h2 className="landing-section-title" style={{ marginBottom: '40px' }}>Built for shipping discipline</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Check size={24} /></div>
            <h3>Scope Board</h3>
            <p>Define what must ship. Cut everything else. No endless backlogs or complex task dependencies.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><CalendarDays size={24} /></div>
            <h3>Launch Forecast</h3>
            <p>See your real launch date based on actual progress, not wishful thinking or original estimates.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><AlertTriangle size={24} /></div>
            <h3>Scope Creep Detection</h3>
            <p>Know the moment your scope grows and exactly what it costs you in delayed launch days.</p>
          </div>
        </div>
      </section>

      <PricingView 
        isPublic={true} 
        activePlan="Free Trial" 
        billingStatus={billingStatus} 
        billingPlanLoading={billingPlanLoading} 
        onNavigate={onNavigate}
        startCheckout={(plan) => {
          if (plan === 'Enterprise') {
            // User will provide the actual contact method for Enterprise
            alert('Enterprise contact method to be added')
          } else {
            onNavigate(hasSession ? dashboardPath : '/signup')
          }
        }} 
      />

      <footer className="landing-footer">
        <div className="brand">
          <div className="brand-mark" style={{ width: '24px', height: '24px' }} aria-hidden="true">
            <Check size={14} strokeWidth={3} />
          </div>
          <strong>ShipCheck</strong>
        </div>
        <div className="landing-footer-links">
          <a onClick={scrollToPricing}>Pricing</a>
          {hasSession ? (
            <a onClick={() => onNavigate(dashboardPath)}>Go to Dashboard</a>
          ) : (
            <>
              <a onClick={() => onNavigate('/login')}>Sign In</a>
              <a onClick={() => onNavigate('/signup')}>Sign Up</a>
            </>
          )}
          <a onClick={() => onNavigate('/privacy')}>Privacy</a>
          <a onClick={() => onNavigate('/terms')}>Terms</a>
        </div>
        <p>Made for builders who ship.</p>
      </footer>
    </div>
  )
}
