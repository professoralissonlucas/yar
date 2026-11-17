# Yar!

Yahtzee jogado com cartas numeradas de 1 a 6, inspirado no minigame **Yar!** do Black Desert Online.
A cada turno você tira 5 cartas de um baralho de 36, tranca as que quiser, troca as outras até 3 ou 4 vezes e marca a mão numa categoria da tabela. Quem somar mais pontos vence.

Dá para jogar **contra a máquina** (Igor, Eileen ou Islin, do fácil ao difícil, com o Prof. Alishow como seu avatar) ou com **2 jogadores no mesmo computador**. São 8 modos de jogo.

**Jogue em:** https://professoralissonlucas.github.io/yar/

## Rodar localmente

Requer Node.js 26.

```bash
npm install      # instala as dependências
npm run dev      # abre o jogo em modo de desenvolvimento
npm test         # roda os testes
```

Outros comandos: `npm run build` (gera o site em `dist/`), `npm run preview` (serve o build), `npm run calibrate` (recalcula os valores esperados usados pelos NPCs) e `npm run tournament` (partidas entre os NPCs).

O deploy no GitHub Pages é automático a cada push na branch `main` (`.github/workflows/deploy.yml`).
