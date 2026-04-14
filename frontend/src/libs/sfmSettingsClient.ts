/** Same key as SettingsModal — duplicate threshold lives in this JSON blob. */
export const SFM_SETTINGS_STORAGE_KEY = 'sfm-settings'

/** Fired after settings are saved so views like DuplicateGraph can refresh without remounting. */
export const SFM_SETTINGS_CHANGED_EVENT = 'sfm-settings-changed'

export function notifySfmSettingsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SFM_SETTINGS_CHANGED_EVENT))
}

const DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD = 0.75

/** Minimum similarity (0–1) to treat two files as duplicates for graph coloring / flagging. */
export function readDuplicateSimilarityThreshold(): number {
  if (typeof window === 'undefined') return DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD
  try {
    const raw = window.localStorage.getItem(SFM_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD
    const p = JSON.parse(raw) as { duplicateSimilarityThreshold?: number }
    const t = p.duplicateSimilarityThreshold
    if (typeof t !== 'number' || Number.isNaN(t)) return DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD
    return Math.min(0.99, Math.max(0.5, t))
  } catch {
    return DEFAULT_DUPLICATE_SIMILARITY_THRESHOLD
  }
}
