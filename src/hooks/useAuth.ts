import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase, type AuthSession, type AuthUser } from '../lib/supabase'

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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY')
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
