/**
 * The Crônicas: every finished mission, one tab per class, written like a
 * character's journal. Reads `world.chronicle`, which the server keeps after
 * the heroes themselves leave the map.
 */
import { GUILD, type ClassId } from '../../shared/guild'
import type { MissionRecord } from '../../shared/types'
import { ago, count, duration, escapeHtml, modelName } from './format'
import { levelFor, progress } from './progression'
import { spriteUrl } from './sprites'

/** Tab order: the main sessions first, then the guild, then outsiders. */
const TABS: ClassId[] = ['mestre', 'mago', 'guerreiro', 'ladino', 'clerigo', 'bardo', 'arquimago', 'mercenario']
const SHOWN = 60

/** How each class tells its own story. */
const VOICE: Record<ClassId, { title: string; verb: string; empty: string }> = {
  mestre: { title: 'Diário do Mestre', verb: 'Liderou a missão', empty: 'Nenhuma missão concluída ainda.' },
  mago: { title: 'Grimório do Mago', verb: 'Traçou o plano', empty: 'O grimório ainda está em branco.' },
  guerreiro: { title: 'Cicatrizes do Guerreiro', verb: 'Forjou', empty: 'Nenhuma batalha travada ainda.' },
  ladino: { title: 'Mapas do Ladino', verb: 'Explorou', empty: 'Nenhum segredo descoberto ainda.' },
  clerigo: { title: 'Orações do Clérigo', verb: 'Curou e conferiu', empty: 'Nada precisou de cura ainda.' },
  bardo: { title: 'Canções do Bardo', verb: 'Escreveu', empty: 'Nenhuma canção composta ainda.' },
  arquimago: { title: 'Lendas do Arquimago', verb: 'Desfez o impossível', empty: 'A lenda ainda não foi convocada.' },
  mercenario: { title: 'Contratos dos Mercenários', verb: 'Cumpriu o contrato', empty: 'Nenhum mercenário contratado ainda.' },
}

const STORAGE_KEY = 'claude-dungeon:chronicle-tab'

function remembered(): ClassId {
  try {
    const value = localStorage.getItem(STORAGE_KEY) as ClassId | null
    return value && TABS.includes(value) ? value : 'mestre'
  } catch {
    return 'mestre'
  }
}

export class ChroniclePanel {
  private tab: ClassId = remembered()
  private records: MissionRecord[] = []

  constructor(
    private readonly root: HTMLElement,
    private readonly onClose: () => void,
  ) {
    root.addEventListener('click', event => {
      const target = event.target as HTMLElement
      if (target === root || target.closest('[data-close]')) {
        this.onClose()
        return
      }
      const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as ClassId | undefined
      if (tab && tab !== this.tab) {
        this.tab = tab
        try {
          localStorage.setItem(STORAGE_KEY, tab)
        } catch {
          // a private window: the tab just is not remembered
        }
        this.render(this.records, Date.now())
      }
    })
  }

  get isOpen(): boolean {
    return !this.root.hidden
  }

  open(records: MissionRecord[]): void {
    this.root.hidden = false
    this.render(records, Date.now())
  }

  close(): void {
    this.root.hidden = true
  }

  render(records: MissionRecord[], now: number): void {
    this.records = records
    if (this.root.hidden) return
    const byClass = new Map<ClassId, MissionRecord[]>(TABS.map(id => [id, []]))
    for (const record of records) byClass.get(record.cls)?.push(record)
    const mine = [...(byClass.get(this.tab) ?? [])].reverse()
    const cls = GUILD[this.tab]
    const voice = VOICE[this.tab]

    this.root.innerHTML = `
      <div class="chronicle-card" role="dialog" aria-label="Crônicas da guilda">
        <header class="chronicle-head">
          <h2>📜 Crônicas da guilda</h2>
          <span class="muted">${count(records.length)} missões registradas</span>
          <button class="close" data-close aria-label="Fechar">✕</button>
        </header>
        <div class="chronicle-body">
          <nav class="chronicle-tabs">
            ${TABS.map(id => {
              const c = GUILD[id]
              const n = byClass.get(id)?.length ?? 0
              const lv = levelFor(this.xp(byClass.get(id) ?? []))
              return `<button class="chronicle-tab${id === this.tab ? ' active' : ''}" data-tab="${id}">
                <img src="${spriteUrl(c.sprite, 2)}" alt="">
                <span style="color:${c.color}">${c.name}</span>
                <span class="chip" title="Nível da classe">Nv ${lv}</span>
                <span class="chip">${n}</span>
              </button>`
            }).join('')}
          </nav>
          <section class="chronicle-page">
            <div class="chronicle-hero">
              <img class="portrait" src="${spriteUrl(cls.sprite, 4)}" alt="">
              <div>
                <h3 style="color:${cls.color}">${voice.title}</h3>
                <p class="muted">${escapeHtml(cls.role)}${cls.model ? ` · ${escapeHtml(modelName(cls.model))}` : ''}</p>
              </div>
            </div>
            ${this.stats(mine)}
            ${
              mine.length === 0
                ? `<p class="muted chronicle-empty">${voice.empty}</p>`
                : `<ol class="chronicle-list">${mine
                    .slice(0, SHOWN)
                    .map(r => this.entry(r, voice.verb, now))
                    .join('')}</ol>${mine.length > SHOWN ? `<p class="muted">E mais ${mine.length - SHOWN} missões antigas.</p>` : ''}`
            }
          </section>
        </div>
      </div>`
  }

  private xp(records: MissionRecord[]): number {
    return records.reduce((n, r) => n + r.toolCalls, 0)
  }

  private stats(records: MissionRecord[]): string {
    if (records.length === 0) return ''
    const hits = this.xp(records)
    const level = progress(hits)
    const time = records.reduce((n, r) => n + Math.max(0, r.endedAt - r.startedAt), 0)
    const failed = records.filter(r => r.status === 'failed').length
    const projects = new Map<string, number>()
    for (const r of records) projects.set(r.project, (projects.get(r.project) ?? 0) + 1)
    const favorite = [...projects].sort((a, b) => b[1] - a[1])[0]
    return `<dl class="chronicle-stats">
      <div><dt>Nível</dt><dd>${level.level}${level.span ? ` <span class="muted">${level.into}/${level.span}</span>` : ''}</dd></div>
      <div><dt>Missões</dt><dd>${count(records.length)}</dd></div>
      <div><dt>Golpes</dt><dd>${count(hits)}</dd></div>
      <div><dt>Tempo em campo</dt><dd>${duration(time)}</dd></div>
      <div><dt>Derrotas</dt><dd>${failed}</dd></div>
      <div><dt>Sala favorita</dt><dd>${escapeHtml(favorite?.[0] ?? '—')}</dd></div>
    </dl>`
  }

  private entry(r: MissionRecord, verb: string, now: number): string {
    const failed = r.status === 'failed'
    const meta = [
      `🏰 ${escapeHtml(r.project)}`,
      `para ${escapeHtml(r.hero)}`,
      duration(Math.max(0, r.endedAt - r.startedAt)),
      `${r.toolCalls} golpes`,
      r.model ? escapeHtml(modelName(r.model)) : '',
      r.cls === 'mercenario' || (r.type !== r.cls && !r.type.startsWith('guild:') && r.cls !== 'mestre') ? escapeHtml(r.type) : '',
    ].filter(Boolean)
    return `<li class="${failed ? 'failed' : ''}">
      <p class="chronicle-line"><span class="chronicle-verb">${failed ? 'Caiu em' : verb}:</span> ${escapeHtml(r.description)}</p>
      <p class="muted">${meta.join(' · ')} <time>${ago(r.endedAt, now)}</time></p>
    </li>`
  }
}
