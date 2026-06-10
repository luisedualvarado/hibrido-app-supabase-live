import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_SNAPSHOT_TABLE = import.meta.env.VITE_SUPABASE_SNAPSHOT_TABLE || 'app_snapshots'
const SUPABASE_DRAFT_KEY = import.meta.env.VITE_SUPABASE_DRAFT_KEY || 'draft'
const SUPABASE_PUBLISHED_KEY = import.meta.env.VITE_SUPABASE_PUBLISHED_KEY || import.meta.env.VITE_SUPABASE_SNAPSHOT_KEY || 'public'
const SUPABASE_HISTORY_TABLE = import.meta.env.VITE_SUPABASE_HISTORY_TABLE || 'app_snapshot_history'

let client = null

export const LIVE_SYNC_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
export const LIVE_SYNC_TABLE = SUPABASE_SNAPSHOT_TABLE
export const LIVE_SYNC_DRAFT_KEY = SUPABASE_DRAFT_KEY
export const LIVE_SYNC_PUBLISHED_KEY = SUPABASE_PUBLISHED_KEY
export const LIVE_SYNC_HISTORY_TABLE = SUPABASE_HISTORY_TABLE

export function getLiveSyncClient() {
  if (!LIVE_SYNC_ENABLED) return null
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

export async function fetchSnapshotRecord(key) {
  const supabase = getLiveSyncClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from(SUPABASE_SNAPSHOT_TABLE)
    .select('snapshot, updated_at')
    .eq('key', key)
    .maybeSingle()

  if (error) throw error
  if (!data?.snapshot) return null
  return {
    snapshot: data.snapshot,
    updatedAt: data.updated_at || null,
  }
}

export async function saveSnapshotRecord(key, snapshot) {
  const supabase = getLiveSyncClient()
  if (!supabase) return null

  const payload = {
    key,
    snapshot,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(SUPABASE_SNAPSHOT_TABLE)
    .upsert(payload, { onConflict: 'key' })
    .select('updated_at')
    .single()

  if (error) throw error
  return {
    updatedAt: data?.updated_at || null,
  }
}

export async function fetchSnapshotHistory(limit = 10, key = SUPABASE_PUBLISHED_KEY) {
  const supabase = getLiveSyncClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from(SUPABASE_HISTORY_TABLE)
    .select('id, snapshot, created_at, snapshot_key')
    .eq('snapshot_key', key)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function insertSnapshotHistory(snapshot, key = SUPABASE_PUBLISHED_KEY) {
  const supabase = getLiveSyncClient()
  if (!supabase) return null

  const payload = {
    snapshot_key: key,
    snapshot,
    created_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(SUPABASE_HISTORY_TABLE)
    .insert(payload)
    .select('id, created_at')
    .single()

  if (error) throw error
  return {
    id: data?.id || null,
    createdAt: data?.created_at || null,
  }
}

export function subscribeToSnapshot(key, onSnapshot, onError) {
  const supabase = getLiveSyncClient()
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`live-snapshot-${key}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: SUPABASE_SNAPSHOT_TABLE,
        filter: `key=eq.${key}`,
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