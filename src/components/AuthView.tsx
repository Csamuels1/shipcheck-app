import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'

type AuthViewProps = {
  initialMode?: 'signin' | 'signup'
  authError: string
  authLoading: boolean
  notice?: string
  onResetPassword: (email: string) => Promise<void>
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (name: string, email: string, password: string) => Promise<void>
}

export function AuthView({ initialMode = 'signup', authError, authLoading, notice = '', onResetPassword, onSignIn, onSignUp }: AuthViewProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSentEmail, setResetSentEmail] = useState('')
  const [canResend, setCanResend] = useState(false)

  useEffect(() => {
    if (!resetSentEmail) return

    const timer = window.setTimeout(() => setCanResend(true), 30000)
    return () => window.clearTimeout(timer)
  }, [resetSentEmail])

  const submit = async () => {
    setLocalError('')
    setResetError('')

    if (!email.trim() || !password.trim()) {
      setLocalError('Enter your email and password to continue.')
      return
    }

    if (mode === 'signup' && !name.trim()) {
      setLocalError('Enter your name so ShipCheck can create your workspace.')
      return
    }

    if (mode === 'signup') {
      await onSignUp(name.trim(), email.trim(), password)
      return
    }

    await onSignIn(email.trim(), password)
  }

  const resetPassword = async () => {
    const resetEmail = email.trim()
    setLocalError('')
    setResetError('')

    if (!email.trim()) {
      setLocalError('Enter your email first, then request a reset link.')
      return
    }

    setResetLoading(true)
    try {
      await onResetPassword(resetEmail)
      setCanResend(false)
      setResetSentEmail(resetEmail)
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'ShipCheck could not send a reset link. Try again.')
    } finally {
      setResetLoading(false)
    }
  }

  const returnToLogin = () => {
    setResetError('')
    setResetSentEmail('')
    setPassword('')
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand onboarding-brand">
          <div className="brand-mark" aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </div>
          <div>
            <strong>ShipCheck</strong>
            <span>Launch accountability</span>
          </div>
        </div>

        <div>
          <span className="eyebrow">Account access</span>
          <h1>{mode === 'signup' ? 'Create your ShipCheck workspace' : 'Log in to ShipCheck'}</h1>
          <p className="muted">Use email and password to save projects, logs, reports, and billing state securely.</p>
        </div>

        {resetSentEmail ? (
          <div className="reset-confirmation" role="status">
            <div className="reset-confirmation-mark" aria-hidden="true">
              <Check size={20} />
            </div>
            <div>
              <h2>Reset link sent.</h2>
              <p>
                Check your inbox for <strong>{resetSentEmail}</strong>. The link expires in 1 hour.
              </p>
            </div>

            <div className="resend-row">
              {canResend ? (
                <button className="button subtle" type="button" onClick={resetPassword} disabled={resetLoading}>
                  {resetLoading ? (
                    <>
                      <span className="button-spinner" aria-hidden="true" />
                      Sending reset link...
                    </>
                  ) : (
                    'Resend link'
                  )}
                </button>
              ) : (
                <span>Resend available in 30s</span>
              )}
              <button className="button secondary" type="button" onClick={returnToLogin}>
                Back to log in
              </button>
            </div>

            {resetError && (
              <div className="inline-error reset-error" role="alert">
                <AlertTriangle size={18} />
                <p>{resetError}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
              <button className={mode === 'signup' ? 'active' : ''} type="button" onClick={() => setMode('signup')}>
                Sign up
              </button>
              <button className={mode === 'signin' ? 'active' : ''} type="button" onClick={() => setMode('signin')}>
                Log in
              </button>
            </div>

            {mode === 'signup' && (
              <label>
                Name
                <input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} />
              </label>
            )}
            <label>
              Email
              <input value={email} type="email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                value={password}
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {(localError || authError || resetError) && (
              <div className="inline-error" role="alert">
                <AlertTriangle size={18} />
                <p>{localError || resetError || authError}</p>
              </div>
            )}

            {notice && !localError && !authError && !resetError && <p className="success-note">{notice}</p>}

            <button className="button primary full" type="button" disabled={authLoading} onClick={submit}>
              {authLoading ? 'Working...' : mode === 'signup' ? 'Create account' : 'Log in'}
              <ArrowRight size={16} />
            </button>

            {mode === 'signin' && (
              <button className="button subtle full" type="button" onClick={resetPassword} disabled={resetLoading || authLoading}>
                {resetLoading ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Sending reset link...
                  </>
                ) : (
                  'Send password reset link'
                )}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}
