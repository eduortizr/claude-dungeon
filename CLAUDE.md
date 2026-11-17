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

- Salas da guilda (pedido do aluno): Taverna = acabou há < 2 min; Sala de jogos = parado 2–10 min, em duplas; Caverna = parado > 10 min (dorme); Sala de treinamento = quartel dos subagentes, que saem de lá quando convocados. Regras em `web/src/placement.ts` (pura, testada); jogos em `web/src/games.ts`.
- Arquimago (`guild:arquimago`, Fable 5.2): só escalação; o roteador nunca escolhe (teste em `router.test.ts`).
- App Electron em `desktop/`: `startServer()` (`server/src/app.ts`) roda dentro do app; janela + bandeja; "Iniciar com o Windows" abre com `--hidden`. `npm run app` (sem instalar), `npm run app:dist` (instalador NSIS em `desktop/release/`, ~96 MB, sem assinatura de código). A versão do `electron` fica fixa no `desktop/package.json` (o electron-builder recusa faixa `^`). Dados do app em `%APPDATA%\Claude Dungeon\world.json`.

## Observações

- No Windows, parar o `npm run dev` pelo harness pode deixar o `tsx` e o `vite` órfãos nas portas: conferir com `Get-NetTCPConnection -LocalPort 4747` e parar só esses PIDs.
- Prints: puppeteer-core + Edge headless (script descartável no scratchpad); `--virtual-time-budget` do Edge trava com SSE aberto. Do app: abrir com `--remote-debugging-port=9333` e `puppeteer.connect`.
- Mudou o plugin? Ele é lido da pasta do marketplace: rodar `/reload-plugins` ou abrir uma sessão nova.
