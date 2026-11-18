# Yar!

Yahtzee jogado com cartas numeradas de 1 a 6, inspirado no minigame **Yar!** do Black Desert Online.
A cada turno você tira 5 cartas de um baralho de 36, tranca as que quiser, troca as outras até 3 ou 4 vezes e marca a mão numa categoria da tabela. Quem somar mais pontos vence.

Dá para jogar **contra a máquina**, o Prof. Alishow, em três modos (Bonzinho, Exigente e Banca de Prova, do fácil ao difícil), com **2 jogadores no mesmo computador** ou **online contra um amigo**. São 8 modos de jogo.

**Jogue em:** https://professoralissonlucas.github.io/yar/

## Jogar online

1. Na tela inicial, escolha **Online** e clique em **Continuar**.
2. Entre com sua **conta Google** ou como **convidado** (sem conta) e confirme seu apelido.
3. Um de vocês **cria a sala**: escolhe o modo de jogo e se quer o timer de 45 s. Aparece um código de 6 caracteres.
4. Mande para o amigo o **link do convite** (abre direto na sala) ou só o **código**. O amigo digita o código (ou cola o link) em **Entrar com código**.
5. Quando os dois estiverem na sala, quem criou clica em **Começar**. Quem joga primeiro é sorteado.
6. Na sua vez, jogue normalmente. Na vez do amigo, você vê as cartas, os cadeados e a marcação dele em tempo real.
7. No fim, os dois podem pedir **Revanche** (a partida recomeça na mesma sala) ou **Sair da sala**.

Bom saber:
- Se a internet cair, aparece um aviso no topo e o jogo tenta reconectar sozinho. A jogada feita nesse meio-tempo é enviada quando a conexão voltar.
- Saiu sem querer? Abra o link de novo, ou digite o código: você volta para a mesma sala.
- Se o amigo sumir por mais de 1 minuto, aparece "Oponente desconectado". Depois de 2 minutos você pode clicar em **Encerrar partida** e ganha por abandono.
- Salas sem jogadas há 24 horas expiram.

## Rodar localmente

Requer Node.js 26.

```bash
npm install      # instala as dependências
npm run dev      # abre o jogo em modo de desenvolvimento
npm test         # roda os testes
```

Outros comandos: `npm run build` (gera o site em `dist/`), `npm run preview` (serve o build), `npm run calibrate` (recalcula os valores esperados usados pela máquina), `npm run tournament` (partidas entre os níveis da máquina) e `npm run screenshots` (prints das telas em `screenshots/`, via Playwright).

O deploy no GitHub Pages é automático a cada push na branch `main` (`.github/workflows/deploy.yml`).

### Firebase (modo online)

O online usa Firebase Authentication (Google e Anônimo) e Cloud Firestore, no plano gratuito (Spark). A configuração do app fica em `src/online/firebaseConfig.js`.

- **Regras de segurança:** `firestore.rules`. Depois de mudar, publique em *Console do Firebase → Firestore Database → Regras* (cole o arquivo e clique em **Publicar**). Os modos e as faixas de pontos dentro das regras precisam bater com `src/core/` (há um teste que confere).
- **Domínios autorizados:** em *Authentication → Configurações*, o domínio do site (`professoralissonlucas.github.io`) precisa estar na lista.
- **Limpeza de salas:** cada sala tem `expireAt` (24 h após a última jogada). Para o Firestore apagar sozinho as salas vencidas, crie uma política de TTL no campo `expireAt` da coleção `rooms`. Isso exige o plano Blaze.
