import { useState } from 'react'
import { AlertTriangle, ArrowRight, Check } from 'lucide-react'

type AuthViewProps = {
  initialMode?: 'signin' | 'signup'
  authError: string
  authLoading: boolean
  onResetPassword: (email: string) => Promise<void>
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (name: string, email: string, password: string) => Promise<void>
}

export function AuthView({ initialMode = 'signup', authError, authLoading, onResetPassword, onSignIn, onSignUp }: AuthViewProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const submit = async () => {
    setLocalError('')
    setResetSent(false)

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
    if (!email.trim()) {
      setLocalError('Enter your email first, then request a reset link.')
      return
    }
    await onResetPassword(email.trim())
    setResetSent(true)
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

        {(localError || authError) && (
          <div className="inline-error" role="alert">
            <AlertTriangle size={18} />
            <p>{localError || authError}</p>
          </div>
        )}
        {resetSent && <p className="success-note">Password reset email requested. Check your inbox.</p>}

        <button className="button primary full" type="button" disabled={authLoading} onClick={submit}>
          {authLoading ? 'Working...' : mode === 'signup' ? 'Create account' : 'Log in'}
          <ArrowRight size={16} />
        </button>

        {mode === 'signin' && (
          <button className="button subtle full" type="button" onClick={resetPassword}>
            Send password reset link
          </button>
        )}
      </section>
    </main>
  )
}
