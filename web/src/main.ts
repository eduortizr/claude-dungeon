import './style.css'
import { GUILD, GUILD_MEMBERS, type ClassId } from '../../shared/guild'
import type { WorldState } from '../../shared/types'
import { Camera } from './camera'
import { modelName } from './format'
import { Panel } from './panel'
import { Scene } from './scene'
import { setSheet, spriteUrl } from './sprites'
import { connect, type ConnectionStatus } from './stream'
import { whiteSheet } from './tiles'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

const canvas = document.querySelector<HTMLCanvasElement>('#map')!
const ctx = canvas.getContext('2d')!
const sheet = await loadImage('/assets/tiny-dungeon.png')
setSheet(sheet)

const scene = new Scene(sheet, whiteSheet(sheet))
const camera = new Camera()
let world: WorldState = { heroes: {}, updatedAt: 0 }

const panel = new Panel(document.querySelector('#panel')!, () => select(undefined))
document.querySelector('#panel')!.addEventListener('rerender', () => renderPanel())

function select(heroId: string | undefined): void {
  scene.selectedHeroId = heroId
  renderPanel()
}

function renderPanel(): void {
  const hero = scene.selectedHeroId ? world.heroes[scene.selectedHeroId] : undefined
  panel.render(hero, Date.now())
}

// ---- top bar and legend ----------------------------------------------------

function renderSummary(): void {
  const heroes = Object.values(world.heroes).filter(h => h.status !== 'offline')
  const fighting = heroes.filter(h => h.status === 'working').length
  const waiting = heroes.filter(h => h.status === 'waiting').length
  const party = heroes.reduce((n, h) => n + h.party.filter(m => m.status === 'working').length, 0)
  document.querySelector('#summary')!.innerHTML = [
    `<span><b>${heroes.length}</b> heróis</span>`,
    `<span class="working"><b>${fighting}</b> em combate</span>`,
    waiting ? `<span class="waiting"><b>${waiting}</b> esperando você</span>` : '',
    `<span><b>${party}</b> subagentes em missão</span>`,
  ].join('')
}

function renderLegend(): void {
  const classes: ClassId[] = [...GUILD_MEMBERS]
  document.querySelector('#legend')!.innerHTML =
    '<summary>Guilda</summary>' +
    classes
      .map(id => {
        const cls = GUILD[id]
        return `<div class="legend-row" title="${cls.role}">
          <img src="${spriteUrl(cls.sprite, 2)}" alt="">
          <span><b style="color:${cls.color}">${cls.name}</b></span>
          <span class="chip">${modelName(cls.model)}</span>
        </div>`
      })
      .join('')
}

function setConnection(status: ConnectionStatus): void {
  const label = { connecting: 'conectando…', online: 'ao vivo', offline: 'servidor desligado' }[status]
  const element = document.querySelector('#connection')!
  element.className = status
  element.textContent = label
}

renderLegend()

// ---- canvas size, input, loop ----------------------------------------------

function resize(): void {
  const ratio = window.devicePixelRatio || 1
  camera.pixelRatio = ratio
  canvas.width = Math.floor(canvas.clientWidth * ratio)
  canvas.height = Math.floor(canvas.clientHeight * ratio)
  const { width, height } = scene.worldSize
  camera.fit(canvas.width, canvas.height, width, height)
}
window.addEventListener('resize', resize)
resize()

camera.attach(canvas, point => select(scene.pick(point)))

function syncScene(): void {
  if (scene.sync(world)) {
    const { width, height } = scene.worldSize
    camera.fit(canvas.width, canvas.height, width, height)
  }
}

connect(next => {
  world = next
  syncScene()
  renderSummary()
  renderPanel()
}, setConnection)

// Every second, even with no new events: idle heroes move on (taverna -> jogos -> caverna)
// with time alone, and the panel's "há X s" timers tick.
setInterval(() => {
  syncScene()
  renderPanel()
}, 1000)

let last = performance.now()
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  scene.update(dt)
  scene.render(ctx, camera, canvas.width, canvas.height)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
