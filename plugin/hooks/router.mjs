// The router: picks the guild class for a task from its words.
//
// Each class has weighted word stems (Portuguese and English). The task's short
// description counts double, since it names the job; the long prompt adds
// context. Highest score wins; ties go to the class listed first; no match
// falls back to the Guerreiro, the generalist.

/** @type {Record<string, Array<[string, number]>>} */
const RULES = {
  ladino: [
    ['busc', 3], ['procur', 3], ['encontr', 3], ['achar', 3], ['onde fica', 4], ['onde esta', 4],
    ['localiz', 3], ['explor', 3], ['mapear', 2], ['listar', 2], ['investig', 2], ['entender como', 2],
    ['search', 3], ['find', 3], ['locate', 3], ['where is', 4], ['explore', 3], ['look up', 2], ['grep', 2],
  ],
  clerigo: [
    [' test', 3], [' bug', 4], ['erro', 2], ['corrig', 3], ['revis', 3], ['debug', 3], ['depur', 3],
    ['falha', 2], ['quebr', 2], ['audit', 3], ['seguranca', 2], ['valid', 2],
    [' fix', 3], ['review', 3], ['failing', 3], ['broken', 2], ['security', 2], ['regression', 3],
  ],
  bardo: [
    ['readme', 5], ['document', 4], ['docs', 3], ['comentar', 2], ['changelog', 4], ['traduz', 3],
    ['tutorial', 3], ['explicar', 2], ['texto', 2],
    ['translate', 3], ['write up', 3], ['docstring', 4], ['release notes', 4],
  ],
  mago: [
    ['arquitet', 5], ['planej', 4], [' plano', 3], ['design', 3], ['estrateg', 3], ['estrutur', 2],
    ['trade-off', 3], ['tradeoff', 3], ['decidir', 2], ['abordag', 3], ['compar', 2],
    ['architect', 5], [' plan ', 3], ['strategy', 3], ['approach', 3], ['decide', 2],
  ],
  guerreiro: [
    ['implement', 4], ['criar', 2], ['adicion', 2], ['construi', 2], ['feature', 3], ['codific', 3],
    ['refator', 3], ['migr', 2], ['endpoint', 3], ['component', 2], ['funcao', 2],
    ['build', 2], ['add ', 2], ['create', 2], ['refactor', 3], ['code', 1],
  ],
}

const ORDER = ['ladino', 'clerigo', 'bardo', 'mago', 'guerreiro']

/** Lowercase, no accents, single spaces: "Revisão do Código" -> "revisao do codigo". */
export function normalize(text) {
  return ` ${String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')} `
}

function score(text, stems) {
  let total = 0
  const hits = []
  for (const [stem, weight] of stems) {
    if (text.includes(stem)) {
      total += weight
      hits.push(stem.trim())
    }
  }
  return { total, hits }
}

/**
 * @param {{ description?: string, prompt?: string }} task
 * @returns {{ classId: string, score: number, reason: string }}
 */
export function classify(task) {
  const description = normalize(task.description)
  const prompt = normalize(task.prompt)

  let best = { classId: 'guerreiro', score: 0, reason: 'nenhuma pista: o Guerreiro é o generalista' }
  for (const classId of ORDER) {
    const inDescription = score(description, RULES[classId])
    const inPrompt = score(prompt, RULES[classId])
    const total = inDescription.total * 2 + inPrompt.total
    if (total > best.score) {
      const hits = [...new Set([...inDescription.hits, ...inPrompt.hits])].slice(0, 3)
      best = { classId, score: total, reason: `pistas: ${hits.join(', ')}` }
    }
  }
  return best
}

/** Only generic calls are re-routed: an explicit agent type is the caller's choice. */
export function shouldRoute(input) {
  const type = input?.subagent_type
  return type === undefined || type === '' || type === 'general-purpose'
}
