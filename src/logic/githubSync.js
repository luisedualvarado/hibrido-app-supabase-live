const GITHUB_SYNC_OWNER = import.meta.env.VITE_GITHUB_SYNC_OWNER || 'luisedualvarado'
const GITHUB_SYNC_REPO = import.meta.env.VITE_GITHUB_SYNC_REPO || 'hibrido-app'
const GITHUB_SYNC_BRANCH = import.meta.env.VITE_GITHUB_SYNC_BRANCH || 'main'
const GITHUB_SYNC_PATH = import.meta.env.VITE_GITHUB_SYNC_PATH || 'src/data/publishedSnapshot.json'
const GITHUB_SYNC_TOKEN_KEY = 'hibrido-app-github-sync-token'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const GITHUB_SYNC_ENABLED = Boolean(GITHUB_SYNC_OWNER && GITHUB_SYNC_REPO && GITHUB_SYNC_BRANCH && GITHUB_SYNC_PATH)
export const GITHUB_SYNC_REPO_LABEL = `${GITHUB_SYNC_OWNER}/${GITHUB_SYNC_REPO}`
export const GITHUB_SYNC_POLL_INTERVAL_MS = 15000

function encodePath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

function buildContentsApiUrl() {
  return `https://api.github.com/repos/${GITHUB_SYNC_OWNER}/${GITHUB_SYNC_REPO}/contents/${encodePath(GITHUB_SYNC_PATH)}`
}

function buildRawSnapshotUrl() {
  return `https://raw.githubusercontent.com/${GITHUB_SYNC_OWNER}/${GITHUB_SYNC_REPO}/${GITHUB_SYNC_BRANCH}/${GITHUB_SYNC_PATH}`
}

function toBase64(text) {
  const bytes = encoder.encode(text)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(base64) {
  const binary = atob(base64.replace(/\n/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return decoder.decode(bytes)
}

async function parseError(response, fallbackMessage) {
  try {
    const payload = await response.json()
    return payload?.message || fallbackMessage
  } catch (error) {
    return fallbackMessage
  }
}

export function loadGitHubSyncToken() {
  try {
    return window.sessionStorage.getItem(GITHUB_SYNC_TOKEN_KEY) || ''
  } catch (error) {
    return ''
  }
}

export function saveGitHubSyncToken(token) {
  try {
    if (!token) window.sessionStorage.removeItem(GITHUB_SYNC_TOKEN_KEY)
    else window.sessionStorage.setItem(GITHUB_SYNC_TOKEN_KEY, token)
  } catch (error) {
    // Ignore storage errors and keep the in-memory token only.
  }
}

export function clearGitHubSyncToken() {
  try {
    window.sessionStorage.removeItem(GITHUB_SYNC_TOKEN_KEY)
  } catch (error) {
    // Ignore storage errors.
  }
}

export async function fetchPublishedSnapshot({ includeSha = false, token = '' } = {}) {
  if (!GITHUB_SYNC_ENABLED) return null

  if (!includeSha) {
    const response = await fetch(`${buildRawSnapshotUrl()}?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(await parseError(response, 'No se pudo leer la vista publica compartida.'))
    }
    const snapshot = await response.json()
    return {
      snapshot,
      json: JSON.stringify(snapshot),
      sha: null,
    }
  }

  const headers = { Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${buildContentsApiUrl()}?ref=${encodeURIComponent(GITHUB_SYNC_BRANCH)}`, {
    headers,
  })
  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo leer el snapshot publicado en GitHub.'))
  }

  const payload = await response.json()
  const snapshot = JSON.parse(fromBase64(payload.content || ''))
  return {
    snapshot,
    json: JSON.stringify(snapshot),
    sha: payload.sha || null,
  }
}

export async function publishPublishedSnapshot(snapshot, token, sha = null) {
  if (!GITHUB_SYNC_ENABLED) return null
  if (!token?.trim()) {
    throw new Error('Ingresa un token de GitHub para sincronizar la vista publica.')
  }

  let nextSha = sha
  if (!nextSha) {
    const remote = await fetchPublishedSnapshot({ includeSha: true, token })
    nextSha = remote?.sha || null
  }

  const nextJson = `${JSON.stringify(snapshot, null, 2)}\n`
  const response = await fetch(buildContentsApiUrl(), {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Sync public snapshot ${new Date().toISOString()}`,
      branch: GITHUB_SYNC_BRANCH,
      sha: nextSha,
      content: toBase64(nextJson),
    }),
  })

  if (!response.ok) {
    throw new Error(await parseError(response, 'No se pudo publicar la vista publica en GitHub.'))
  }

  const payload = await response.json()
  return {
    sha: payload?.content?.sha || nextSha,
    json: JSON.stringify(snapshot),
  }
}