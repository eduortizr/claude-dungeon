/**
 * Scrubs what the sessions do before it reaches the map: the home folder
 * becomes `~` and secrets become `•••`. Pure; applied to every text that comes
 * from the user or from tools (commands, paths, prompts, descriptions).
 */
import { homedir } from 'node:os'

export const MASK = '•••'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** `C:\Users\me`, `C:/Users/me` and `/c/Users/me` spellings of one folder (case-insensitive). */
function homeRules(home: string): RegExp[] {
  const clean = home.replace(/[\\/]+$/, '')
  if (clean === '') return []
  const slashed = clean.replace(/\\/g, '/')
  const forms = [slashed]
  const drive = /^([A-Za-z]):(\/.*)$/.exec(slashed)
  if (drive) forms.push(`/${drive[1]}${drive[2]}`)
  return forms.map(form => {
    const flexible = escapeRegExp(form).replace(/\//g, '[\\\\/]')
    return new RegExp(`(?<![\\w./~-])${flexible}(?=$|[^\\w.-])`, 'gi')
  })
}

// A Windows user folder may hold spaces and accents ("João Silva"). The name runs
// to the next path separator or quote; a space is only kept between words when the
// name ends at a separator, a quote, a shell operator or the end of the line, so
// "ls C:/Users/Ana && npm test" keeps its tail.
const NAME_CHAR = '[^\\\\/\\s"\'`:*?<>|&;]'
const USER_NAME = `(?:${NAME_CHAR}+(?: ${NAME_CHAR}+)*(?=[\\\\/"'\`]|[ \\t]*(?:[&|;<>]|\\r?$))|${NAME_CHAR}+)`
// Unix-style prefixes only count at the start of a word (not inside a URL).
const WORD_START = '(?<=^|[\\s"\'`=])'

const GENERIC_HOME: RegExp[] = [
  new RegExp(`(?<![\\w./~-])[A-Za-z]:[\\\\/]Users[\\\\/]${USER_NAME}`, 'gim'),
  new RegExp(`${WORD_START}/mnt/[A-Za-z]/Users/${USER_NAME}`, 'gim'),
  new RegExp(`${WORD_START}/[A-Za-z]/Users/${USER_NAME}`, 'gim'),
  // \\wsl$\Ubuntu\home\name and \\wsl.localhost\Ubuntu\home\name
  /(?<![\w./~-])\\\\wsl(?:\$|\.localhost)\\[^\\/\s"'`]+\\home\\[^\\/\s"'`]+/gi,
  new RegExp(`${WORD_START}/(?:home|Users)/[^/\\s"'\`]+`, 'gm'),
]

const KEYWORD = '(?:token|api[_-]?key|secret|password|passwd|senha|authorization)'
const VALUE = `("[^"]*"|'[^']*'|[^\\s"'&;]+)`

const SECRET_RULES: Array<[RegExp, string]> = [
  // -----BEGIN ... PRIVATE KEY----- ... -----END ... PRIVATE KEY----- (or cut off before the END)
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MASK],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*$/g, MASK],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, MASK],
  // https://user:pass@host -> https://•••@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${MASK}@`],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${MASK}`],
  // KEY=value, KEY: value, "Authorization: Bearer x", export X_TOKEN=...
  [
    new RegExp(`(\\b[\\w-]*${KEYWORD}[\\w-]*["']?\\s*[=:]\\s*)(?:(?:Bearer|Basic)\\s+)?${VALUE}`, 'gi'),
    `$1${MASK}`,
  ],
  // --password hunter2 (a space only counts after a flag, so "fix token handling" survives)
  [new RegExp(`(--?[\\w-]*${KEYWORD}[\\w-]*\\s+)${VALUE}`, 'gi'), `$1${MASK}`],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, MASK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, MASK],
  [/\bxox[bp]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bAIza[0-9A-Za-z_-]{35}/g, MASK],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{36}/g, MASK],
]

export function redact(text: string, home: string = homedir()): string {
  let out = text
  for (const rule of [...homeRules(home), ...GENERIC_HOME]) out = out.replace(rule, '~')
  for (const [rule, replacement] of SECRET_RULES) out = out.replace(rule, replacement)
  return out
}
