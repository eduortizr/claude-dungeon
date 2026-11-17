# Claude Dungeon

Mapa pixel art (tema RPG) das sessões do Claude Code e uma guilda de subagentes com roteamento por classe/modelo. Projeto de portfólio; ideia inspirada num vídeo (`../Interface Claude/Vídeo exemplo/`, fora do repositório) e no ruflo. Visão geral, arquitetura e decisões no `README.md`.

## Estrutura

- `shared/`: tipos (`types.ts`) e tabela da guilda (`guild.ts`). O plugin tem uma cópia em `plugin/hooks/guild.mjs` (roda sem build); `shared/guild.test.ts` garante que as duas batem.
- `server/`: `node:http` + SSE; regra do jogo no reducer puro `server/src/state.ts`.
- `plugin/`: plugin `guild` (hooks `.mjs` + `agents/*.md`). Instalado neste PC em 2026-11-17 via `claude plugin marketplace add <esta pasta>` + `claude plugin install guild@claude-dungeon` (escopo user): toda sessão nova manda eventos para `127.0.0.1:4747`.
- `web/`: Vite + Canvas 2D. Tiles do Kenney Tiny Dungeon (CC0); índices em `web/src/tiles.ts`.
- `desktop/`: app Electron (esbuild empacota `src/main.ts` + o servidor em `dist/main.cjs`).

## Comandos

- `npm run dev`: servidor (:4747) + mapa (Vite; a 5173 costuma estar ocupada aqui, ele pula para a próxima).
- `npm run demo [-- --loop]`: sessões simuladas, passando pelo roteador real.
- `npm test`, `npm run typecheck`.

## Salas, Arquimago e app (2026-11-17)

- Salas da guilda (pedido do aluno): Taverna = acabou há < 2 min; Sala de jogos = parado 2–10 min, em volta da mesa redonda do Mestre; Caverna = parado > 10 min (dorme); Sala de treinamento = quartel dos subagentes, que saem de lá quando convocados. Regras em `web/src/placement.ts` (pura, testada); jogos em `web/src/games.ts`.
- Arquimago (`guild:arquimago`, Fable 5.2): só escalação; o roteador nunca escolhe (teste em `router.test.ts`).
- App Electron em `desktop/`: `startServer()` (`server/src/app.ts`) roda dentro do app; janela + bandeja; "Iniciar com o Windows" abre com `--hidden`. `npm run app` (sem instalar), `npm run app:dist` (instalador NSIS em `desktop/release/`, ~96 MB, sem assinatura de código). A versão do `electron` fica fixa no `desktop/package.json` (o electron-builder recusa faixa `^`). Dados do app em `%APPDATA%\Claude Dungeon\world.json`.

## Salas novas, floresta e Câmara de ouro (2026-11-17, pedido do aluno)

- Biblioteca (projeto `Estudos`) e Câmara de ouro (projeto `Invest`) ocupam duas antigas câmaras seladas: `GUILD_ROOMS[].project` em `web/src/map.ts`; esses projetos não ganham sala própria.
- Floresta abaixo da dungeon (heróis entram e saem pela borda esquerda): parado 10–25 min → floresta, > 25 min → caverna (`placement.ts`). Árvores decididas por `noise(x, y)`, então não mudam quando o mapa alarga.
- O que a folha do Kenney não tem é desenhado em `web/src/props.ts` (pixel art com retângulos); Velho Mercador e Alquimista são sprites próprios em `web/src/characters.ts` (ids negativos). Residentes (taverneiro, alquimista, mercador) nunca saem da sala.
- Falas: D&D, conversas em dupla, conversas da guilda, floresta e residentes em `web/src/games.ts`.
- Notícias: `server/src/market.ts` lê o briefing do agente do Invest (`Invest/dados/overlay_briefing.json`, gravado por `bot/agente.py`). Neste PC a pasta está em `data/config.json` e em `%APPDATA%\Claude Dungeon\config.json` (`marketDir`), fora do git.

## Observações

- No Windows, parar o `npm run dev` pelo harness pode deixar o `tsx` e o `vite` órfãos nas portas: conferir com `Get-NetTCPConnection -LocalPort 4747` e parar só esses PIDs.
- Prints: puppeteer-core + Edge headless (script descartável no scratchpad); `--virtual-time-budget` do Edge trava com SSE aberto. Do app: abrir com `--remote-debugging-port=9333` e `puppeteer.connect`.
- Mudou o plugin? Ele é lido da pasta do marketplace: rodar `/reload-plugins` ou abrir uma sessão nova.

## Mais vida no mapa (2026-11-17, pedido do aluno)

- **Arena:** sala de projeto = `ARENA_W` (23 tiles, duas salas e a parede). `buildMap` assenta as salas com um cursor por lado (cima/baixo) e `RoomLayout.w` guarda a largura; ~44 vagas em linhas alternadas, as mais perto do monstro primeiro (`map.test.ts` testa vagas únicas e alcance a partir da porta). Seladas e salas da guilda continuam com 11.
- **Combate:** o monstro revida (`retaliate` em `scene.ts`: avança, número vermelho, empurrão `Actor.shove`, flash branco `Actor.hurt`, pixels vermelhos `burst`); a cada 3 mortes numa luta vem um chefe 2x (`isBossWave`, 22 de HP, aura vermelha); tremida leve só se a sala estiver visível; tochas, espinhos que sobem e descem, teias e ossos nas arenas.
- **Rotina da guilda:** `web/src/routine.ts` (pura, testada): 1 min por etapa, ciclo treino, taverna, jogos, treino, floresta, treino; cada classe com fase diferente. Os membros ficam em `RoomLayout.guests` (taverna, jogos) ou nas últimas vagas da floresta; quando convocados saem de onde estão e voltam para onde o treinando está.
- **Portas:** `map.doors` (portas das salas + portão da caverna); `drawDoors` abre quando alguém chega a < 1,9 tile e fecha 0,7 s depois.
- **Residentes novos:** Mestre do Claude (sprite -3, sala de jogos, dragãozinho `drawDragon`, conversa com ociosos e mestra D&D com `rpgScene`/`rpgLines`) e Menestrel (sprite -4, palquinho da taverna, notas flutuando; heróis na taverna balançam).
- **Floresta:** `web/src/wildlife.ts` (funções puras do tempo): cervo, coelho e raposa cruzam a trilha, patos e peixes no lago. Decoração nova (`torch`, `spikes`, `cobweb`, `bones`, `plant`, `fern`, `stage`) em `props.ts`.

## Segunda leva de "mais vida" (2026-11-17)

- **Arena vazia (causa):** `syncRooms` criava sala para todo projeto com herói não offline, mesmo parado na taverna/jogos/floresta; as salas ocupavam as primeiras posições, empurravam a sala de quem trabalhava para fora da tela (a câmera começa na caverna, à esquerda) e ficavam vazias. Agora `activeProjects` (`placement.ts`, testada) só dá arena a quem está trabalhando, esperando ou com subagente em missão; a sala some quando a luta acaba. `ARENA_W` = `ROOM_W*2 + 7` (29), ~60 vagas por arena (`map.test.ts`: únicas e todas alcançáveis).
- **Quem age:** `Actor.act()`/`spot` (0,7 s): anel e brilho no chão, etiqueta acesa na cor da classe (dourado para herói) e seta sobre quem bate (`drawSpotlight` em `scene.ts`). Fala nova (bolha nova) também acende; é detectada em `update` por troca de `actor.bubble`.
- **Sala de jogos:** uma mesa redonda 3x3 (`roundtable`), Mestre na ponta (com o dragão) e 11 assentos em volta (`SEATS` em `map.ts`); heróis ociosos ocupam os primeiros, membros da guilda os 2 últimos (`room.guests`). `Place` agora é `{ kind: 'jogos', seat }`. Acabaram dardos e os jogos de dados/cartas/braço de ferro (`games.ts` ainda os exporta, sem uso na cena). A campanha (`campaign()`) roda a cada ~10 s para até 4 sentados: cena do Mestre, d20 (`drawD20`) e placar "Mestre x Grupo" sobre a mesa. Parede: cabeças de dragão, grifo e basilisco, armaduras na parede e dois suportes de armadura.
- **Taverna:** palco do menestrel em `P(8, 4)`. **Treino:** props `scratches` e `soot`. **Câmara de ouro:** `wallmap`, `wallchart`, `maptable`; o Velho Mercador anda (`Resident.stops`, `merchantWalk`) entre a mesa e as paradas, sem deixar de trabalhar nem falar.
- **Caverna para corredor:** 6 tiles de transição (`FLOOR.blend0..5`, `BLEND_SAND`, grãos 2x2 por ruído do tile; não consome o `random()` do mapa), tochas nas paredes do corredor (fora das portas) e dois `lamppost` no portão da floresta.
- **Noite:** `web/src/daylight.ts` (`nightLevel`, pura): escuro das 18:30 às 06:00, 5 min de transição. `drawNight` em `scene.ts` desenha um véu azul num canvas à parte e fura buracos quentes nas luzes (`findLights`); testar com o relógio falso (`Date.now` somado a um deslocamento: o véu usa `new Date(Date.now())`).
- Prints: scripts descartáveis no scratchpad (`night.mjs` com `AT=19:00`). Mapa mais largo que a tela: a arena do projeto pode ficar metade fora da vista até arrastar o mapa.
