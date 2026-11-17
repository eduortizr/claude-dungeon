/**
 * Turns a tool call into the short RPG-flavored line shown in speech bubbles
 * and in the timeline ("Lendo o pergaminho state.ts").
 */
import { GUILD, classOfAgentType } from '../../shared/guild'

const MAX = 48

export function truncate(text: string, max = MAX): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

function fileName(path: unknown): string {
  if (typeof path !== 'string' || path === '') return 'um pergaminho'
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function describeTool(tool: string, input: Record<string, unknown> = {}): string {
  switch (tool) {
    case 'Read':
      return `Lendo o pergaminho ${fileName(input.file_path)}`
    case 'Write':
      return `Forjando ${fileName(input.file_path)}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Reforjando ${fileName(input.file_path ?? input.notebook_path)}`
    case 'Bash':
    case 'PowerShell':
      return truncate(`Conjurando \`${str(input.command)}\``)
    case 'Grep':
      return truncate(`Rastreando "${str(input.pattern)}"`)
    case 'Glob':
      return truncate(`Mapeando ${str(input.pattern)}`)
    case 'WebFetch':
    case 'WebSearch':
      return 'Consultando o oráculo'
    case 'TodoWrite':
      return 'Atualizando o diário de missões'
    case 'Agent':
    case 'Task': {
      const cls = GUILD[classOfAgentType(str(input.subagent_type) || undefined)]
      return truncate(`Convocando ${cls.name}: ${str(input.description)}`)
    }
    default:
      return truncate(`Usando ${tool.replace(/^mcp__/, '').replace(/__/g, ' › ')}`)
  }
}
