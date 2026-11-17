# Claude Dungeon

Mapa pixel art (tema RPG) das sessões do Claude Code e uma guilda de subagentes com roteamento por classe/modelo. Projeto de portfólio; ideia inspirada num vídeo (`../Interface Claude/Vídeo exemplo/`, fora do repositório) e no ruflo. Visão geral, arquitetura e decisões no `README.md`.

## Estrutura

- `shared/`: tipos (`types.ts`) e tabela da guilda (`guild.ts`). O plugin tem uma cópia em `plugin/hooks/guild.mjs` (roda sem build); `shared/guild.test.ts` garante que as duas batem.
- `server/`: `node:http` + SSE; regra do jogo no reducer puro `server/src/state.ts`.
- `plugin/`: plugin `guild` (hooks `.mjs` + `agents/*.md`). Instalado neste PC em 2026-11-17 via `claude plugin marketplace add <esta pasta>` + `claude plugin install guild@claude-dungeon` (escopo user): toda sessão nova manda eventos para `127.0.0.1:4747`.
- `web/`: Vite + Canvas 2D. Tiles do Kenney Tiny Dungeon (CC0); índices em `web/src/tiles.ts`.

## Comandos

- `npm run dev`: servidor (:4747) + mapa (Vite; a 5173 costuma estar ocupada aqui, ele pula para a próxima).
- `npm run demo [-- --loop]`: sessões simuladas, passando pelo roteador real.
- `npm test`, `npm run typecheck`.

## Observações

- No Windows, parar o `npm run dev` pelo harness pode deixar o `tsx` e o `vite` órfãos nas portas: conferir com `Get-NetTCPConnection -LocalPort 4747` e parar só esses PIDs.
- Prints: puppeteer-core + Edge headless (script descartável no scratchpad); `--virtual-time-budget` do Edge trava com SSE aberto.
- Mudou o plugin? Ele é lido da pasta do marketplace: rodar `/reload-plugins` ou abrir uma sessão nova.
