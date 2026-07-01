import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase, type AuthSession, type AuthUser } from '../lib/supabase'

const passwordRecoveryKey = 'shipcheck.auth.password-recovery'

function hasRecoveryInUrl() {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return search.get('type') === 'recovery' || hash.get('type') === 'recovery'
}

function readPasswordRecoveryFlag() {
  return sessionStorage.getItem(passwordRecoveryKey) === 'true' || hasRecoveryInUrl()
}

function persistPasswordRecoveryFlag() {
  sessionStorage.setItem(passwordRecoveryKey, 'true')
}

function clearPasswordRecoveryFlag() {
  sessionStorage.removeItem(passwordRecoveryKey)
}

type AuthState = {
  authError: string
  authLoading: boolean
  clearPasswordRecovery: () => void
  configured: boolean
  isPasswordRecovery: boolean
  resetPassword: (email: string) => Promise<void>
  session: AuthSession | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  user: AuthUser | null
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(readPasswordRecoveryFlag)

  useEffect(() => {
    if (!supabase) return

    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      if (readPasswordRecoveryFlag()) {
        persistPasswordRecoveryFlag()
        setIsPasswordRecovery(true)
      }
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const recoveryEvent = event === 'PASSWORD_RECOVERY' || readPasswordRecoveryFlag()
      if (recoveryEvent) persistPasswordRecoveryFlag()
      setSession(nextSession)
      setIsPasswordRecovery(recoveryEvent)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signUp = async (name: string, email: string, password: string) => {
    if (!supabase) return
    setAuthError('')
    setAuthLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }

  const signIn = async (email: string, password: string) => {
    if (!supabase) return
    setAuthError('')
    clearPasswordRecoveryFlag()
    setIsPasswordRecovery(false)
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }

  const resetPassword = async (email: string) => {
    if (!supabase) return
    setAuthError('')
    const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/reset-password`,
    })
    if (error) {
      setAuthError(error.message)
      throw error
    }
  }

  const signOut = async () => {
    if (!supabase) return
    setAuthError('')
    clearPasswordRecoveryFlag()
    setIsPasswordRecovery(false)
    await supabase.auth.signOut()
  }

  const updatePassword = async (password: string) => {
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setAuthError(error.message)
      throw error
    }
  }

  const clearPasswordRecovery = () => {
    clearPasswordRecoveryFlag()
    setIsPasswordRecovery(false)
  }

  return {
    authError,
    authLoading,
    clearPasswordRecovery,
    configured: isSupabaseConfigured,
    isPasswordRecovery,
    resetPassword,
    session,
    signIn,
    signOut,
    signUp,
    updatePassword,
    user: session?.user ?? null,
  }
}
