'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

export default function AuthTestPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('Not signed in')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()

      if (error) {
        setStatus(`Session error: ${error.message}`)
        return
      }

      const user = data.session?.user ?? null

      if (user) {
        setStatus('Signed in')
        setUserId(user.id)
      } else {
        setStatus('Not signed in')
        setUserId(null)
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null

      if (user) {
        setStatus('Signed in')
        setUserId(user.id)
      } else {
        setStatus('Not signed in')
        setUserId(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function handleSignUp() {
    setStatus('Signing up...')

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setStatus(`Sign up error: ${error.message}`)
      return
    }

    setStatus('Sign up submitted. Check email if confirmation is required.')
  }

  async function handleSignIn() {
    setStatus('Signing in...')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setStatus(`Sign in error: ${error.message}`)
      return
    }

    setStatus('Signed in')
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      setStatus(`Sign out error: ${error.message}`)
      return
    }

    setStatus('Signed out')
    setUserId(null)
  }

  return (
    <div style={{ padding: 16 }}>
      <h1>Auth test</h1>

      <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={handleSignUp}>Sign up</button>
        <button onClick={handleSignIn}>Sign in</button>
        <button onClick={handleSignOut}>Sign out</button>
      </div>

      <p>Status: {status}</p>
      <p>User ID: {userId ?? 'none'}</p>
    </div>
  )
}