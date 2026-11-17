# Yar!

Yahtzee jogado com cartas numeradas de 1 a 6, inspirado no minigame **Yar!** do Black Desert Online.
A cada turno você tira 5 cartas de um baralho de 36, tranca as que quiser, troca as outras até 3 ou 4 vezes e marca a mão numa categoria da tabela. Quem somar mais pontos vence.

Dá para jogar **contra a máquina**, o Prof. Alishow, em três modos (Bonzinho, Exigente e Banca de Prova, do fácil ao difícil), ou com **2 jogadores no mesmo computador**. São 8 modos de jogo.

**Jogue em:** https://professoralissonlucas.github.io/yar/

## Rodar localmente

Requer Node.js 26.

```bash
npm install      # instala as dependências
npm run dev      # abre o jogo em modo de desenvolvimento
npm test         # roda os testes
```

Outros comandos: `npm run build` (gera o site em `dist/`), `npm run preview` (serve o build), `npm run calibrate` (recalcula os valores esperados usados pela máquina), `npm run tournament` (partidas entre os níveis da máquina) e `npm run screenshots` (prints das telas em `screenshots/`, via Playwright).

O deploy no GitHub Pages é automático a cada push na branch `main` (`.github/workflows/deploy.yml`).
