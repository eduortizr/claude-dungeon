/**
 * The guild: which character class handles which kind of task, and on which
 * model. The plugin keeps its own copy in `plugin/hooks/guild.mjs` (it has to
 * run without a build step); `shared/guild.test.ts` keeps both in sync.
 */

export type ClassId = 'mestre' | 'mago' | 'guerreiro' | 'ladino' | 'clerigo' | 'bardo' | 'arquimago' | 'mercenario'

export interface GuildClass {
  id: ClassId
  /** Display name, in Portuguese. */
  name: string
  role: string
  /** Model alias the class runs on; `null` = inherits the session's model. */
  model: 'fable' | 'opus' | 'sonnet' | 'haiku' | null
  /** Index of the class sprite in the Tiny Dungeon tilemap. */
  sprite: number
  /** Accent color used for name tags and the side panel. */
  color: string
}

export const GUILD: Record<ClassId, GuildClass> = {
  mestre: { id: 'mestre', name: 'Mestre da guilda', role: 'Sessão principal: conversa com você e delega', model: null, sprite: 87, color: '#f5b544' },
  mago: { id: 'mago', name: 'Mago', role: 'Arquitetura e planejamento', model: 'opus', sprite: 84, color: '#9b7bff' },
  guerreiro: { id: 'guerreiro', name: 'Guerreiro', role: 'Implementação de código', model: 'sonnet', sprite: 96, color: '#ff6b5a' },
  ladino: { id: 'ladino', name: 'Ladino', role: 'Exploração e busca (só leitura)', model: 'haiku', sprite: 112, color: '#5fd38d' },
  clerigo: { id: 'clerigo', name: 'Clérigo', role: 'Revisão, testes e bugs', model: 'sonnet', sprite: 100, color: '#f2f2f2' },
  bardo: { id: 'bardo', name: 'Bardo', role: 'Documentação e textos', model: 'haiku', sprite: 99, color: '#ff8ad8' },
  arquimago: { id: 'arquimago', name: 'Arquimago', role: 'Lendário: só para os problemas mais difíceis', model: 'fable', sprite: 111, color: '#ffd34d' },
  mercenario: { id: 'mercenario', name: 'Mercenário', role: 'Subagente de fora da guilda', model: null, sprite: 109, color: '#c9a36b' },
}

/** The classes that live in the training room, in station order. */
export const GUILD_MEMBERS = ['mago', 'guerreiro', 'ladino', 'clerigo', 'bardo', 'arquimago'] as const satisfies readonly ClassId[]

/** Name of the Claude Code plugin; its agents are dispatched as `guild:<class>`. */
export const PLUGIN_NAME = 'guild'

/** Sprites a main session (a "Mestre") may wear, so several sessions look apart. */
export const HERO_SPRITES = [87, 85, 86, 88, 97, 98] as const

export const HERO_NAMES = [
  'Aldric', 'Brienna', 'Caelum', 'Dagna', 'Eldor', 'Fenra', 'Gorim', 'Halvar',
  'Isolde', 'Joren', 'Kaela', 'Lyra', 'Morgath', 'Nyssa', 'Orin', 'Perrin',
  'Quilla', 'Rurik', 'Sylas', 'Thalia', 'Ulric', 'Vesna', 'Wren', 'Yara', 'Zoltan',
] as const

/**
 * Maps a subagent type to the class that represents it: `guild:ladino`, a built-in (`Explore`), or a
 * project's own agent named after a class, `<class>-<role>` (`ladino-pesquisador`, `bardo-roteirista`),
 * so a project can give a class its own tools and still show up as that class on the map.
 */
export function classOfAgentType(type: string | undefined): ClassId {
  if (!type) return 'guerreiro'
  const prefix = `${PLUGIN_NAME}:`
  const isClass = (id: string): id is ClassId => id in GUILD && id !== 'mestre' && id !== 'mercenario'
  const name = type.startsWith(prefix) ? type.slice(prefix.length) : type
  if (isClass(name)) return name
  const roleOf = /^([a-z]+)-[\w-]+$/.exec(name)?.[1]
  if (roleOf && isClass(roleOf)) return roleOf
  const builtins: Record<string, ClassId> = {
    Explore: 'ladino',
    Plan: 'mago',
    'general-purpose': 'guerreiro',
    'claude-code-guide': 'bardo',
  }
  return builtins[type] ?? 'mercenario'
}

/** Small, stable string hash (FNV-1a) so a session always gets the same name and look. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function heroNameFor(sessionId: string): string {
  return HERO_NAMES[hashString(sessionId) % HERO_NAMES.length]!
}

export function heroSpriteFor(sessionId: string): number {
  return HERO_SPRITES[hashString(`${sessionId}:look`) % HERO_SPRITES.length]!
}
