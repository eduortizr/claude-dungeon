import { describe, expect, it } from 'vitest'
// The plugin's standalone copy of the guild table (no build step there).
import { CLASSES as PLUGIN_CLASSES } from '../plugin/hooks/guild.mjs'
import { GUILD, PLUGIN_NAME, classOfAgentType, heroNameFor } from './guild'

describe('guild', () => {
  it('matches the plugin copy: same classes, same models', () => {
    const shared = Object.values(GUILD)
      .filter(c => c.id !== 'mestre' && c.id !== 'mercenario')
      .map(c => ({ id: c.id, model: c.model }))
    const plugin = PLUGIN_CLASSES.map((c: { id: string; model: string }) => ({ id: c.id, model: c.model }))
    expect(plugin).toEqual(shared)
  })

  it('maps agent types to classes', () => {
    expect(classOfAgentType(`${PLUGIN_NAME}:mago`)).toBe('mago')
    expect(classOfAgentType('Explore')).toBe('ladino')
    expect(classOfAgentType('general-purpose')).toBe('guerreiro')
    expect(classOfAgentType('some-other-agent')).toBe('mercenario')
    expect(classOfAgentType(`${PLUGIN_NAME}:mestre`)).toBe('mercenario')
  })

  it('maps a project agent named <class>-<role> to its class', () => {
    expect(classOfAgentType('ladino-pesquisador')).toBe('ladino')
    expect(classOfAgentType('bardo-roteirista')).toBe('bardo')
    expect(classOfAgentType('clerigo-qa')).toBe('clerigo')
    expect(classOfAgentType('mago-editor')).toBe('mago')
    expect(classOfAgentType('mestre-qualquer')).toBe('mercenario')
    expect(classOfAgentType('code-reviewer')).toBe('mercenario')
  })

  it('gives a session the same name every time', () => {
    expect(heroNameFor('abc')).toBe(heroNameFor('abc'))
  })
})
