// The guild, as the plugin sees it. Kept in sync with shared/guild.ts by
// shared/guild.test.ts (this file must run with plain Node, no build step).

export const PLUGIN_NAME = 'guild'

/**
 * @typedef {{ id: string, name: string, model: 'fable' | 'opus' | 'sonnet' | 'haiku', when: string, escalationOnly?: boolean }} GuildClass
 * `escalationOnly`: never picked by the router; summoned on purpose, for the hardest problems.
 */

/** @type {GuildClass[]} */
export const CLASSES = [
  { id: 'mago', name: 'Mago', model: 'opus', when: 'arquitetura, planejamento, decisões de design, comparar abordagens' },
  { id: 'guerreiro', name: 'Guerreiro', model: 'sonnet', when: 'implementar código: features, refatorações, endpoints, componentes' },
  { id: 'ladino', name: 'Ladino', model: 'haiku', when: 'explorar e buscar no código (só leitura): onde fica X, como Y funciona' },
  { id: 'clerigo', name: 'Clérigo', model: 'sonnet', when: 'revisar código, escrever e rodar testes, caçar e corrigir bugs' },
  { id: 'bardo', name: 'Bardo', model: 'haiku', when: 'documentação: README, comentários, changelog, textos e explicações' },
  {
    id: 'arquimago',
    name: 'Arquimago',
    model: 'fable',
    when: 'o mais capaz e o mais caro: só quando o usuário pedir ou quando outro membro já falhou na mesma tarefa (bug que ninguém acha, decisão de arquitetura difícil)',
    escalationOnly: true,
  },
]

export function classById(id) {
  return CLASSES.find(c => c.id === id)
}
