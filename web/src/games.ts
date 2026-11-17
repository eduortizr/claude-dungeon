/**
 * The games idle heroes play in the sala de jogos, one per table, and what
 * they say about the result. Randomness is injected so rounds are testable.
 */

export type GameKind = 'dados' | 'cartas' | 'braco' | 'rpg'

/** Which game each table of the sala de jogos holds. */
export const TABLE_GAMES: readonly GameKind[] = ['rpg', 'dados', 'cartas', 'braco']

export const GAME_NAMES: Record<GameKind, string> = {
  dados: 'Dados',
  cartas: 'Cartas',
  braco: 'Queda de braço',
  rpg: 'Masmorras & Dragões',
}

export interface Round {
  game: GameKind
  /**
   * What each side rolled or drew (dice 1-6, cards 1-13); unused for arm
   * wrestling. In Masmorras & Dragões side 0 is the master: [difficulty, d20].
   */
  values: [number, number]
  winner: 0 | 1
}

type Random = () => number

function pick(random: Random, max: number): number {
  return 1 + Math.floor(random() * max)
}

/** Plays one round. Dice and cards are rerolled on a tie, so there is always a winner. */
export function playRound(game: GameKind, random: Random = Math.random): Round {
  if (game === 'rpg') {
    // The master sets a difficulty (10-18) and the player rolls a d20: a 20 always passes, a 1 always fails.
    const dc = 9 + pick(random, 9)
    const roll = pick(random, 20)
    return { game, values: [dc, roll], winner: roll === 20 || (roll !== 1 && roll >= dc) ? 1 : 0 }
  }
  if (game === 'braco') return { game, values: [0, 0], winner: random() < 0.5 ? 0 : 1 }
  const max = game === 'dados' ? 6 : 13
  for (;;) {
    const a = pick(random, max)
    const b = pick(random, max)
    if (a !== b) return { game, values: [a, b], winner: a > b ? 0 : 1 }
  }
}

const CARD_FACES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function cardFace(value: number): string {
  return CARD_FACES[value - 1] ?? '?'
}

const WIN_LINES = [
  'Ha! Paga a próxima rodada, {loser}!',
  '{hits} golpes hoje e ainda tenho energia pra isso!',
  'Mais sorte no próximo deploy, {loser}!',
  'Isso que dá passar o dia lendo pergaminho!',
  'Invicto, igual meus testes!',
]

const LOSE_LINES = ['Revanche!', 'Foi sorte...', 'Eu tava deixando.', 'Meu teclado travou!', 'Melhor de três!']

/** A line for the winner or the loser, with {winner}, {loser} and {hits} filled in. */
export function taunt(
  side: 'win' | 'lose',
  vars: { winner: string; loser: string; hits: number },
  random: Random = Math.random,
): string {
  // Bragging about hits only makes sense with some hits to brag about.
  const lines = (side === 'win' ? WIN_LINES : LOSE_LINES).filter(line => vars.hits > 0 || !line.includes('{hits}'))
  return lines[Math.floor(random() * lines.length)]!
    .replace('{winner}', vars.winner)
    .replace('{loser}', vars.loser)
    .replace('{hits}', String(vars.hits))
}

export const TAVERN_TALK = [
  'Taverneiro, mais uma!',
  'Ouvi um merge conflict lá na dungeon.',
  'Dizem que tem um dragão no módulo de pagamentos.',
  'Meu escudo ainda tem marca de NullPointer.',
  'Quem deixou o TODO na sala 3?',
  'O velho da Câmara de ouro não dorme, já reparou?',
  'A Alquimista me ofereceu uma poção. Recusei.',
]

// ---- Masmorras & Dragões -----------------------------------------------------

const RPG_SCENES = [
  'Um baú no fim do corredor... Role Percepção.',
  'O dragão acorda! Role Destreza pra fugir.',
  'Um goblin pede a senha do Wi-Fi. Role Persuasão.',
  'A ponte balança sobre o abismo. Role Atletismo.',
  'A porta tem um enigma em Haskell. Role Inteligência.',
  'Um mímico disfarçado de PR aprovado! Role Iniciativa.',
  'O lich exige testes de regressão. Role Sabedoria.',
  'O taverneiro desconfia de vocês. Role Enganação.',
]

const RPG_NAT20 = ['VINTE NATURAL!!! 🎲', 'Crítico! O dragão nem viu de onde veio.', '20! Pode descrever a cena, mestre.']
const RPG_NAT1 = ['1 natural... tropecei na própria capa.', 'Falha crítica. Alguém tem um clérigo aí?', '1?! Esse dado tá viciado.']
const RPG_PASS = ['Passei! ({roll} contra CD {dc})', 'Sucesso! {roll} na conta.', 'Tirei {roll}. Fácil.']
const RPG_FAIL = ['Só {roll}... falhei.', '{roll}? Dá pra rolar de novo?', 'Errei por pouco ({roll} contra {dc}).']
const RPG_MASTER_WIN = ['Hehe. Role dano em você mesmo.', 'O goblin ri da sua cara.', 'Anotado na ficha. 😈']
const RPG_MASTER_LOSE = ['Tá bom, tá bom... você passou.', 'E eu preparei essa armadilha a semana toda.', 'O monstro foge. Por enquanto.']

/** What the master says before the roll. */
export function rpgScene(random: Random = Math.random): string {
  return RPG_SCENES[Math.floor(random() * RPG_SCENES.length)]!
}

/** The player's reaction to a roll and the master's comeback. */
export function rpgLines(round: Round, random: Random = Math.random): { player: string; master: string } {
  const [dc, roll] = round.values
  const choose = (lines: string[]) =>
    lines[Math.floor(random() * lines.length)]!.replace('{roll}', String(roll)).replace('{dc}', String(dc))
  const player =
    roll === 20 ? choose(RPG_NAT20) : roll === 1 ? choose(RPG_NAT1) : choose(round.winner === 1 ? RPG_PASS : RPG_FAIL)
  return { player, master: choose(round.winner === 1 ? RPG_MASTER_LOSE : RPG_MASTER_WIN) }
}

// ---- conversations -----------------------------------------------------------

/** Two heroes talking: the lines alternate between them, starting with the first. */
export const CONVERSATIONS: readonly (readonly string[])[] = [
  ['Viu o tamanho do monstro no módulo de pagamentos?', 'Vi. Chamei o Guerreiro e fui almoçar.'],
  ['Quantos testes passaram hoje?', 'Todos. Depois que eu apaguei os que falhavam.', '...'],
  ['Dizem que o Arquimago resolve qualquer bug.', 'Resolve, mas cobra caro. Muito caro.'],
  ['Você usa tabs ou espaços?', 'Eu uso o que o linter mandar.'],
  ['Funcionou na minha máquina.', 'Então vamos mandar a sua máquina pro cliente.'],
  ['Já leu a documentação?', 'Documentação é pra quem desiste.', 'Foi assim que você caiu na armadilha ontem.'],
  ['O Ladino achou o arquivo em 2 segundos.', 'Ele é rápido porque não lê nada, só procura.'],
  ['Sexta-feira, deploy?', 'Nem pensar. Eu tenho amor à vida.'],
  ['O Mago passou três horas planejando.', 'E o Guerreiro fez em dez minutos. Errado, mas fez.'],
  ['Escrevi um regex hoje.', 'E agora você tem dois problemas.'],
  ['Viu a Câmara de ouro? O velho não para nunca.', 'Dizem que ele lê as notícias da bolsa até dormindo.'],
  ['Alguém foi na biblioteca?', 'Fui. Tem um monstro aberto em cima da mesa. Não volto lá.'],
  ['Bora uma campanha de Masmorras & Dragões?', 'Só se eu não for o mestre de novo.'],
]

/** Training room banter: the first class speaks, the second answers. */
export const GUILD_BANTER: readonly { a: string; b: string; lines: readonly [string, string] }[] = [
  { a: 'mago', b: 'guerreiro', lines: ['Guerreiro, isso é um boneco de treino, não um bug.', 'Tudo é bug se você bater forte o suficiente.'] },
  { a: 'ladino', b: 'clerigo', lines: ['Três adagas no centro!', 'Vou revisar se foi no centro mesmo.'] },
  { a: 'bardo', b: 'ladino', lines: ['Vou compor uma balada sobre essa flecha.', 'Compõe rápido, eu já achei mais três arquivos.'] },
  { a: 'clerigo', b: 'guerreiro', lines: ['Você esqueceu de testar o escudo.', 'O escudo passou no teste de cair na minha cabeça.'] },
  { a: 'arquimago', b: 'mago', lines: ['Na minha época a gente compilava na mão.', 'Na sua época nem existia teclado, mestre.'] },
  { a: 'mago', b: 'bardo', lines: ['Bardo, o README tá pronto?', 'Tá em versos. Rimei "deploy" com "herói".'] },
  { a: 'guerreiro', b: 'arquimago', lines: ['Mestre, me ensina o feitiço do bug impossível?', 'Primeiro aprenda a ler a mensagem de erro.'] },
]

/** The Mestre do Claude chats with idle heroes: his line, then the hero's answer. */
export const MASTER_CHATS: readonly (readonly [string, string])[] = [
  ['Como vai a missão?', 'Quase lá. Só falta o último teste.'],
  ['Meu dragãozinho gostou de você.', 'Ele acabou de queimar minha capa...'],
  ['Quer jogar a próxima campanha?', 'Só se tiver baú e nenhum mímico.'],
  ['Descansando entre uma missão e outra?', 'Esperando o próximo prompt, mestre.'],
  ['Já rolou os dados hoje?', 'Só no deploy. Deu 1.'],
]

/** What the Mestre says to open a session of Masmorras & Dragões for whoever is idle. */
export const MASTER_OPENERS = [
  'Sentem-se, aventureiros! A campanha começa agora.',
  'Silêncio na mesa... o mestre vai narrar.',
  'Pergaminhos abertos, dados na mão! Vamos jogar.',
]

export type ForestActivityName = 'pescar' | 'ervas' | 'descansar' | 'passear'

export const FOREST_LINES: Record<ForestActivityName, readonly string[]> = {
  pescar: ['Pescando... só vem bug de rio.', 'Esse peixe tem cara de NullPointer.', 'Shh, tá beliscando!'],
  ervas: ['Erva pra poção de foco.', 'Cogumelo vermelho: não comer antes do deploy.', 'A Alquimista vai gostar dessas.'],
  descansar: ['Que silêncio bom, sem notificação.', 'Só cinco minutinhos...', 'Ouvindo os pássaros. E nenhum alerta.'],
  passear: ['Ar puro! Nada de stack trace.', 'Acho que vi um cervo. Ou era um bug.', 'Explorando a trilha.'],
}

/** What the residents mutter while they work, when there is nothing else to say. */
export const RESIDENT_LINES: Record<'taverneiro' | 'alquimista' | 'mercador' | 'mestre' | 'menestrel', readonly string[]> = {
  taverneiro: ['O de sempre?', 'Hoje tem hidromel fresco!', 'Quem quebrou a caneca vai pagar.', 'Mais uma missão? Mais uma rodada!'],
  alquimista: [
    'Hmm, o fígado deste aqui tem três lobos.',
    'Anotação: não lamber a gosma verde.',
    'O caldeirão está quase no ponto.',
    'Alguém tem um olho de goblin sobrando?',
    'Fascinante... ele tem dois corações.',
  ],
  mestre: [
    'Quem quer uma aventura? Tenho uma masmorra fresquinha.',
    'Role iniciativa, só por precaução.',
    'O dragão não morde. Muito.',
    'Já fiz o mapa da próxima campanha. Tem um bug no terceiro andar.',
    'Eu mestro, vocês rolam. Esse é o trato.',
  ],
  menestrel: [
    'Uma balada sobre o deploy de sexta...',
    'Pedidos? Só aceito os que rimam.',
    'Dó, ré, mi... merge conflict!',
    'Essa é pra quem fechou o ticket hoje!',
    'Cantei o dragão do módulo de pagamentos. Ele gostou.',
  ],
  mercador: [
    'Os números não dormem. Eu também não.',
    'Longo prazo, meu jovem. Longo prazo.',
    'Preço não é valor.',
    'Hmm, dividendos... anotado no livro.',
    'Estudo pessoal, não recomendação!',
    'Mais um pergaminho de cotações...',
    'Sessenta anos nesta mesa e ainda me surpreendo.',
  ],
}

/** Picks one line from a list. */
export function oneOf<T>(lines: readonly T[], random: Random = Math.random): T {
  return lines[Math.floor(random() * lines.length)]!
}
