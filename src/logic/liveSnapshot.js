import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SNAPSHOT_TABLE = import.meta.env.VITE_SUPABASE_SNAPSHOT_TABLE || 'app_snapshots'
const SUPABASE_SNAPSHOT_KEY = import.meta.env.VITE_SUPABASE_SNAPSHOT_KEY || 'public'

let client = null

export const LIVE_SYNC_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
export const LIVE_SYNC_TABLE = SUPABASE_SNAPSHOT_TABLE
export const LIVE_SYNC_KEY = SUPABASE_SNAPSHOT_KEY

export function getLiveSyncClient() {
  if (!LIVE_SYNC_ENABLED) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export async function fetchLiveSnapshot() {
  const supabase = getLiveSyncClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from(SUPABASE_SNAPSHOT_TABLE)
    .select('snapshot, updated_at')
    .eq('key', SUPABASE_SNAPSHOT_KEY)
    .maybeSingle()

  if (error) throw error
  return data?.snapshot || null
}

export async function publishLiveSnapshot(snapshot) {
  const supabase = getLiveSyncClient()
  if (!supabase) return null

  const payload = {
    key: SUPABASE_SNAPSHOT_KEY,
    snapshot,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(SUPABASE_SNAPSHOT_TABLE)
    .upsert(payload, { onConflict: 'key' })
    .select('updated_at')
    .single()

  if (error) throw error
  return data
}

export function subscribeToLiveSnapshot(onSnapshot, onError) {
  const supabase = getLiveSyncClient()
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`live-snapshot-${SUPABASE_SNAPSHOT_KEY}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: SUPABASE_SNAPSHOT_TABLE,
        filter: `key=eq.${SUPABASE_SNAPSHOT_KEY}`,
      },
      (payload) => {
        const nextSnapshot = payload?.new?.snapshot
        if (nextSnapshot) onSnapshot(nextSnapshot)
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' && onError) onError(new Error('No se pudo conectar la sincronizacion en tiempo real.'))
    })

  return () => {
    supabase.removeChannel(channel)
  }
}