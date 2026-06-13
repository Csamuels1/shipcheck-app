import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase, type AuthSession, type AuthUser } from '../lib/supabase'

type AuthState = {
  authError: string
  authLoading: boolean
  configured: boolean
  resetPassword: (email: string) => Promise<void>
  session: AuthSession | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  user: AuthUser | null
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState('')

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
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
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
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setAuthLoading(false)
  }

  const resetPassword = async (email: string) => {
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setAuthError(error.message)
  }

  const signOut = async () => {
    if (!supabase) return
    setAuthError('')
    await supabase.auth.signOut()
  }

  return {
    authError,
    authLoading,
    configured: isSupabaseConfigured,
    resetPassword,
    session,
    signIn,
    signOut,
    signUp,
    user: session?.user ?? null,
  }
}
