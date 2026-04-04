'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

export default function SupabaseTestPage() {
  const [status, setStatus] = useState('Checking Supabase...')

  useEffect(() => {
    async function testSupabase() {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!url) {
        setStatus('Missing NEXT_PUBLIC_SUPABASE_URL')
        return
      }

      if (!hasKey) {
        setStatus('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
        return
      }

      const { error } = await supabase.auth.getSession()

      if (error) {
        setStatus(`Supabase error: ${error.message}`)
        return
      }

      setStatus('Supabase client is working')
    }

    testSupabase()
  }, [])

  return <div>{status}</div>
}