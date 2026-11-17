/**
 * The side panel for the selected hero, modeled on the reference video:
 * portrait and status, the party (subagents), the timeline and the stats.
 */
import { GUILD } from '../../shared/guild'
import type { Hero, MarketFeed, TimelineKind } from '../../shared/types'
import { CUSTOM_SPRITES } from './characters'
import { ago, clock, count, duration, escapeHtml, modelName } from './format'
import type { ResidentId } from './map'
import type { Place } from './placement'
import { spriteUrl } from './sprites'

const TIMELINE_STEP = 15

const KIND_ICON: Record<TimelineKind, string> = {
  session: '🚪',
  prompt: '📜',
  tool: '⚔️',
  route: '🧭',
  agent: '🛡️',
  notice: '❗',
  stop: '🏕️',
}

const IDLE_PLACE: Partial<Record<Place['kind'], string>> = {
  taverna: 'Comemorando na taverna',
  jogos: 'Jogando na sala de jogos',
  floresta: 'Passeando na floresta',
  caverna: 'Dormindo na caverna',
}

const RESIDENT_INFO: Record<ResidentId, { name: string; sprite: number; role: string; about: string }> = {
  taverneiro: {
    name: 'Taverneiro',
    sprite: 85,
    role: 'Taverna',
    about: 'Serve quem acabou de cumprir uma missão. Nunca esquece o pedido de ninguém.',
  },
  alquimista: {
    name: 'Alquimista',
    sprite: CUSTOM_SPRITES.alquimista,
    role: 'Biblioteca',
    about:
      'Cuida da biblioteca e do laboratório: livros, poções e um monstro aberto na mesa de dissecação. As sessões do projeto Estudos trabalham aqui.',
  },
  mercador: {
    name: 'Velho Mercador',
    sprite: CUSTOM_SPRITES.mercador,
    role: 'Câmara de ouro',
    about:
      'Não para de trabalhar nunca. Lê as notícias da bolsa que o agente do Invest deixa na mesa e anota tudo no livro-razão.',
  },
}

const TONE_ICON: Record<MarketFeed['highlights'][number]['tone'], string> = { positivo: '▲', negativo: '▼', neutro: '■' }

function statusLine(hero: Hero, now: number, place?: Place): { text: string; tone: string } {
  switch (hero.status) {
    case 'working':
      return { text: `Em combate há ${duration(now - (hero.workingSince ?? hero.lastEventAt))}`, tone: 'working' }
    case 'waiting':
      return { text: 'Esperando você', tone: 'waiting' }
    case 'idle':
      return { text: `${(place && IDLE_PLACE[place.kind]) ?? 'Descansando'} há ${duration(now - hero.lastEventAt)}`, tone: 'idle' }
    case 'offline':
      return { text: 'Deixou a guilda', tone: 'offline' }
  }
}

export class Panel {
  private shown = TIMELINE_STEP
  private heroId?: string

  constructor(
    private readonly root: HTMLElement,
    private readonly onClose: () => void,
  ) {
    root.addEventListener('click', event => {
      const target = event.target as HTMLElement
      if (target.closest('[data-close]')) this.onClose()
      if (target.closest('[data-more]')) {
        this.shown += TIMELINE_STEP
        this.root.dispatchEvent(new CustomEvent('rerender'))
      }
    })
  }

  /** The card of someone who lives in a room; the merchant's lists the day's market news. */
  renderResident(id: ResidentId, market: MarketFeed | undefined, now: number): void {
    this.heroId = undefined
    this.root.hidden = false
    const info = RESIDENT_INFO[id]
    this.root.innerHTML = `
      <header class="panel-head">
        <img class="portrait" src="${spriteUrl(info.sprite, 4)}" alt="">
        <div>
          <h2>${escapeHtml(info.name)}</h2>
          <p class="role">Residente · ${escapeHtml(info.role)}</p>
        </div>
        <button class="close" data-close aria-label="Fechar">✕</button>
      </header>
      <p class="status working"><span class="dot"></span>${id === 'mercador' && market?.busy ? 'Lendo as notícias agora' : 'Sempre trabalhando'}</p>
      <p class="action">${escapeHtml(info.about)}</p>
      ${id === 'mercador' ? this.news(market, now) : ''}`
  }

  private news(market: MarketFeed | undefined, now: number): string {
    if (!market) {
      return `<section><h3>Notícias</h3><p class="muted">Nenhum briefing encontrado. Aponte <code>marketDir</code> para a pasta do briefing (veja o README).</p></section>`
    }
    const when = market.busy ? 'lendo agora…' : market.updatedLabel || (market.updatedAt ? ago(market.updatedAt, now) : '')
    const highlights = market.highlights
      .map(
        h => `<li class="${h.tone}">
          <strong><span class="tone">${TONE_ICON[h.tone]}</span> ${escapeHtml(h.title)}</strong>
          ${h.why ? `<p>${escapeHtml(h.why)}</p>` : ''}
        </li>`,
      )
      .join('')
    return `
      <section>
        <h3>Notícias da bolsa <span class="muted">${escapeHtml(when)}</span></h3>
        <ul class="news">${market.headlines.map(h => `<li>${escapeHtml(h)}</li>`).join('')}</ul>
      </section>
      ${highlights ? `<section><h3>Destaques</h3><ul class="highlights">${highlights}</ul></section>` : ''}
      <p class="muted disclaimer">Estudo pessoal, não recomendação.</p>`
  }

  render(hero: Hero | undefined, now: number, place?: Place): void {
    if (!hero) {
      this.root.hidden = true
      this.heroId = undefined
      return
    }
    if (hero.id !== this.heroId) {
      this.heroId = hero.id
      this.shown = TIMELINE_STEP
    }
    this.root.hidden = false
    const status = statusLine(hero, now, place)
    const working = hero.party.filter(m => m.status === 'working').length
    const timeline = hero.timeline.slice(-this.shown).reverse()
    const usage = hero.stats.usage

    this.root.innerHTML = `
      <header class="panel-head">
        <img class="portrait" src="${spriteUrl(hero.sprite, 4)}" alt="">
        <div>
          <h2>${escapeHtml(hero.name)}</h2>
          <p class="role">${GUILD.mestre.name}${hero.model ? ` · ${escapeHtml(modelName(hero.model))}` : ''}</p>
          <p class="room">🏰 ${escapeHtml(hero.room)}</p>
        </div>
        <button class="close" data-close aria-label="Fechar">✕</button>
      </header>

      <p class="status ${status.tone}"><span class="dot"></span>${escapeHtml(status.text)}</p>
      <p class="action">${escapeHtml(hero.action)}</p>

      <section>
        <h3>Party <span class="muted">${working ? `${working} em missão` : ''}</span></h3>
        ${
          hero.party.length === 0
            ? '<p class="muted">Nenhum subagente convocado ainda.</p>'
            : `<ul class="party">${hero.party
                .slice()
                .reverse()
                .map(member => {
                  const cls = GUILD[member.cls]
                  const state =
                    member.status === 'working'
                      ? escapeHtml(member.action)
                      : `${member.status === 'done' ? 'Voltou' : 'Caiu'} ${member.endedAt ? ago(member.endedAt, now) : ''}`
                  return `<li class="${member.status}">
                    <img src="${spriteUrl(cls.sprite, 2)}" alt="">
                    <div>
                      <strong style="color:${cls.color}">${cls.name}</strong>
                      <span class="chip">${escapeHtml(modelName(member.model))}</span>
                      <p>${escapeHtml(member.description)}</p>
                      <p class="muted">${state} · ${member.toolCalls} golpes</p>
                    </div>
                  </li>`
                })
                .join('')}</ul>`
        }
      </section>

      <section>
        <h3>Linha do tempo <span class="muted">${hero.timeline.length}</span></h3>
        <ul class="timeline">
          ${timeline
            .map(
              entry => `<li class="${entry.kind}${entry.memberId ? ' member' : ''}">
                <span class="icon">${KIND_ICON[entry.kind]}</span>
                <span class="text">${escapeHtml(entry.text)}</span>
                <time>${ago(entry.ts, now)}</time>
              </li>`,
            )
            .join('')}
        </ul>
        ${hero.timeline.length > this.shown ? `<button class="more" data-more>Mostrar mais ${Math.min(TIMELINE_STEP, hero.timeline.length - this.shown)}</button>` : ''}
      </section>

      <section>
        <h3>Estatísticas</h3>
        <dl class="stats">
          <dt>Missões (prompts)</dt><dd>${hero.stats.prompts}</dd>
          <dt>Golpes (chamadas de ferramenta)</dt><dd>${hero.stats.toolCalls}</dd>
          <dt>Subagentes convocados</dt><dd>${hero.stats.subagents}</dd>
          <dt>Tokens de entrada</dt><dd>${count(usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)}</dd>
          <dt>Tokens de saída</dt><dd>${count(usage.outputTokens)}</dd>
          <dt>Modelo</dt><dd>${hero.model ? escapeHtml(modelName(hero.model)) : 'lido ao fim da missão'}</dd>
          <dt>Sessão</dt><dd class="mono" title="${escapeHtml(hero.id)}">${escapeHtml(hero.id.slice(0, 13))}…</dd>
          <dt>Início</dt><dd>${clock(hero.startedAt)}</dd>
          <dt>Duração</dt><dd>${duration(hero.lastEventAt - hero.startedAt)}</dd>
        </dl>
      </section>`
  }
}
