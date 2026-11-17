import { describe, expect, it } from 'vitest'
import { classify, normalize, shouldRoute } from './router.mjs'
import { toEvent } from './lib.mjs'

describe('classify', () => {
  it.each([
    ['Onde fica a autenticação', 'ladino'],
    ['Find the API routes', 'ladino'],
    ['Corrigir bug no login', 'clerigo'],
    ['Review the payment module', 'clerigo'],
    ['Atualizar o README', 'bardo'],
    ['Planejar a arquitetura do cache', 'mago'],
    ['Implementar endpoint de pedidos', 'guerreiro'],
  ])('%s -> %s', (description, expected) => {
    expect(classify({ description }).classId).toBe(expected)
  })

  it('weighs the description over the prompt', () => {
    const result = classify({ description: 'Escrever testes', prompt: 'implementar se faltar algo' })
    expect(result.classId).toBe('clerigo')
  })

  it('falls back to the Guerreiro with no clue', () => {
    expect(classify({ description: 'xyz' })).toMatchObject({ classId: 'guerreiro', score: 0 })
  })

  it('never escalates to the Arquimago on its own', () => {
    const hard = 'Investigar bug muito difícil de arquitetura, revisar tudo, ninguém achou a causa'
    expect(classify({ description: hard, prompt: hard }).classId).not.toBe('arquimago')
  })

  it('explains its choice', () => {
    expect(classify({ description: 'Buscar onde fica o parser' }).reason).toContain('busc')
  })
})

describe('normalize', () => {
  it('drops accents and case, pads with spaces', () => {
    expect(normalize('Revisão  do Código')).toBe(' revisao do codigo ')
  })
})

describe('shouldRoute', () => {
  it('routes only generic calls', () => {
    expect(shouldRoute({})).toBe(true)
    expect(shouldRoute({ subagent_type: 'general-purpose' })).toBe(true)
    expect(shouldRoute({ subagent_type: 'Explore' })).toBe(false)
    expect(shouldRoute({ subagent_type: 'guild:mago' })).toBe(false)
  })
})

describe('toEvent', () => {
  it('keeps only the tool input fields the map needs', () => {
    const event = toEvent({
      hook_event_name: 'PreToolUse',
      session_id: 's',
      tool_name: 'Write',
      tool_input: { file_path: 'a.ts', content: 'secret file contents' },
    })
    expect(event).toMatchObject({ event: 'PreToolUse', session_id: 's', tool_input: { file_path: 'a.ts' } })
    expect(event.tool_input).not.toHaveProperty('content')
    expect(event).not.toHaveProperty('prompt')
  })

  it('flags failed tool responses', () => {
    const event = toEvent({ hook_event_name: 'PostToolUse', session_id: 's', tool_response: { is_error: true } })
    expect(event.tool_error).toBe(true)
  })
})
