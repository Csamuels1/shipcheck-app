import { useState } from 'react'
import { AlertTriangle, Check, LockKeyhole } from 'lucide-react'

type ResetPasswordViewProps = {
  onCancel: () => void
  onComplete: () => Promise<void>
  onUpdatePassword: (password: string) => Promise<void>
}

export function ResetPasswordView({ onCancel, onComplete, onUpdatePassword }: ResetPasswordViewProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')

    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords must match.')
      return
    }

    setLoading(true)
    try {
      await onUpdatePassword(password)
      await onComplete()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'ShipCheck could not update your password. Try the reset link again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel reset-password-panel">
        <div className="brand onboarding-brand">
          <div className="brand-mark" aria-hidden="true">
            <Check size={20} strokeWidth={3} />
          </div>
          <div>
            <strong>ShipCheck</strong>
            <span>Launch accountability</span>
          </div>
        </div>

        <div className="reset-password-icon" aria-hidden="true">
          <LockKeyhole size={22} />
        </div>

        <div>
          <span className="eyebrow">Password recovery</span>
          <h1>Create a new password</h1>
          <p className="muted">Choose a new password for your account. You will log in manually after this update.</p>
        </div>

        <label>
          New password
          <input
            value={password}
            type="password"
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          Confirm new password
          <input
            value={confirmPassword}
            type="password"
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        {error && (
          <div className="inline-error" role="alert">
            <AlertTriangle size={18} />
            <p>{error}</p>
          </div>
        )}

        <button className="button primary full" type="button" onClick={submit} disabled={loading}>
          {loading ? (
            <>
              <span className="button-spinner" aria-hidden="true" />
              Updating password...
            </>
          ) : (
            'Update password'
          )}
        </button>

        <button className="button subtle full" type="button" onClick={onCancel} disabled={loading}>
          Back to log in
        </button>
      </section>
    </main>
  )
}
