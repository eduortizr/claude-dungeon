/** Text formatting for the panel, in Portuguese. Pure, so it is unit-tested. */

export function duration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min`
}

export function ago(ts: number, now: number): string {
  return `há ${duration(now - ts)}`
}

/** 1234 -> "1,2 mil", 4_100_000 -> "4,1 M", as the video's stats panel shows. */
export function count(n: number): string {
  if (n < 1000) return String(n)
  const [value, unit] = n < 1_000_000 ? [n / 1000, 'mil'] : [n / 1_000_000, 'M']
  return `${value.toFixed(1).replace('.', ',').replace(',0', '')} ${unit}`
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/** "claude-opus-5-5" -> "Opus 5.5"; aliases pass through capitalized. */
export function modelName(model: string | null | undefined): string {
  if (!model) return 'herda da sessão'
  const match = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  if (match) {
    const [, family, major, minor] = match
    return `${family![0]!.toUpperCase()}${family!.slice(1)} ${major}${minor && minor.length <= 2 ? `.${minor}` : ''}`
  }
  return model[0]!.toUpperCase() + model.slice(1)
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
