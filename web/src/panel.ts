/**
 * The side panel for the selected hero, modeled on the reference video:
 * portrait and status, the party (subagents), the timeline and the stats.
 */
import { GUILD } from '../../shared/guild'
import type { Hero, TimelineKind } from '../../shared/types'
import { ago, clock, count, duration, escapeHtml, modelName } from './format'
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

function statusLine(hero: Hero, now: number): { text: string; tone: string } {
  switch (hero.status) {
    case 'working':
      return { text: `Em combate há ${duration(now - (hero.workingSince ?? hero.lastEventAt))}`, tone: 'working' }
    case 'waiting':
      return { text: 'Esperando você', tone: 'waiting' }
    case 'idle':
      return { text: `Descansando na caverna há ${duration(now - hero.lastEventAt)}`, tone: 'idle' }
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

  render(hero: Hero | undefined, now: number): void {
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
    const status = statusLine(hero, now)
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
