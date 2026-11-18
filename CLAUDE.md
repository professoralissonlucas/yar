# Yar! — Yahtzee de cartas (web)

Jogo web inspirado no **Yar!** do Black Desert Online: um Yahtzee jogado com cartas numeradas de 1 a 6 em vez de dados.
Modos: **contra a máquina** (3 níveis de NPC) e **contra um amigo online** (salas com código, via Firebase).
Publicado no **GitHub Pages**. Interface e textos em **português do Brasil**.

---

## Stack e convenções

- **Vite + JavaScript puro (ES modules)**, sem framework. HTML/CSS simples.
- **Firebase JS SDK modular (v10+)**: Authentication + Cloud Firestore. Nada de Cloud Functions (exige plano pago).
- Deploy no GitHub Pages via **GitHub Actions** (`.github/workflows/deploy.yml`). `vite.config.js` com `base: '/<nome-do-repo>/'`.
- **Lógica do jogo é pura e separada da interface** (`src/core/`): sem acesso a DOM, sem Firebase, sem `Math.random` direto (recebe um gerador de números aleatórios por parâmetro, para permitir testes e seeds).
- Testes da lógica com **Vitest** (`npm test`).
- Visual das cartas é **provisório**: retângulo branco com o número grande no centro e nos cantos. Todo o estilo de carta fica em `src/ui/card.css` para ser trocado depois.
- Código e nomes de variáveis em inglês; textos da tela em português.

### Estrutura de pastas sugerida
```
src/
  core/          # regras puras: deck, scoring, game state, modos
  ai/            # NPCs (easy, medium, hard)
  online/        # Firebase: auth, salas, sincronização
  ui/            # telas, componentes, css
  main.js
tests/
```

---

## Regras do jogo

### Cartas e baralho
- Valores de 1 a 6 (o 1 aparece como **"A"** na carta, como no Yar).
- A cada **turno**, o jogador usa um baralho novo e embaralhado de **36 cartas (6 de cada valor)** — constante `DECK_COPIES_PER_VALUE = 6`, configurável.
- Cartas descartadas numa troca **não voltam** ao baralho durante aquele turno. O número de cartas restantes no baralho aparece na tela.

### Turno
1. O jogador clica em **"Tirar cartas"** e recebe 5 cartas (isso conta como a 1ª tirada).
2. Pode **trancar** (🔒) qualquer carta clicando nela. Cartas trancadas não são trocadas.
3. Clica em **"Tirar cartas"** de novo para trocar as não trancadas. O total de tiradas por turno é **3 ou 4**, conforme o modo (botão mostra `Tirar cartas (1/3)`). Depois de cada tirada o botão fica bloqueado até as cartas terminarem de chegar (mínimo 700 ms, com barra de progresso); cliques nesse tempo são ignorados. Marcar categoria também ignora cliques repetidos.
4. A qualquer momento depois da 1ª tirada, o jogador escolhe **uma categoria ainda vazia** na tabela para marcar os pontos da mão atual. Isso encerra o turno.
5. Se nenhuma categoria pontuar, ele **é obrigado a zerar** uma categoria vazia.
6. **Timer opcional de 45 s** por turno (ligável nas opções). Se acabar: marca automaticamente a categoria vazia de maior pontuação; se todas dariam 0, zera a de menor potencial (ordem: Uns, Dois, …).

### Partida
- Os jogadores alternam turnos. Cada categoria só pode ser marcada **uma vez por jogador**.
- O número de turnos de cada jogador = número de categorias do modo escolhido.
- A partida termina quando todos preencherem todas as categorias. **Vence quem somar mais pontos**; empate é possível.
- Sem bônus de seção superior (diferente do Yahtzee clássico).

### Categorias (nomes convencionais do Yahtzee em português)

| id | Nome | Pontuação | Regra |
|---|---|---|---|
| `ones` | Uns | 0–5 | Soma das cartas 1 |
| `twos` | Dois | 0–10 | Soma das cartas 2 |
| `threes` | Três | 0–15 | Soma das cartas 3 |
| `fours` | Quatros | 0–20 | Soma das cartas 4 |
| `fives` | Cincos | 0–25 | Soma das cartas 5 |
| `sixes` | Seis | 0–30 | Soma das cartas 6 |
| `pair` | Par | 0–12 | Pelo menos 2 iguais → soma **só do par de maior valor** (6,6,x,x,x = 12) |
| `three_kind` | Trinca | 0–18 | Pelo menos 3 iguais → soma **só dessas 3** |
| `four_kind` | Quadra | 0–24 | Pelo menos 4 iguais → soma **só dessas 4** |
| `two_pair` | Dois Pares | 0 ou 15 | Dois pares de **valores diferentes** (vale também com full house: 3,3,3,5,5). Quadra sozinha não conta |
| `full_house` | Full House | 0 ou 25 | Exatamente 3 de um valor + 2 de **outro** valor. Cinco iguais não contam |
| `yar` | Yar! | 0 ou 50 | 5 cartas iguais |
| `small_straight` | Sequência Menor | 0 ou 30 | 4 valores em sequência (1-2-3-4, 2-3-4-5 ou 3-4-5-6), ordem não importa |
| `large_straight` | Sequência Maior | 0 ou 40 | 5 valores em sequência (1-2-3-4-5 ou 2-3-4-5-6), ordem não importa |
| `chance` | Chance | 5–30 | Soma de todas as 5 cartas |

Observação: a fonte em inglês lista a Quadra como 0–20, mas o máximo real (quatro 6) é 24 — usar 24.

Na tabela, cada nome tem um ícone "i" com uma **dica própria** (sem `title`): abre ao passar o mouse, ao tocar (toca de novo ou fora para fechar) e ao focar com Tab (`aria-describedby`). Mostra regra, pontuação, exemplo com mini-cartas e, na vez do jogador, "Sua mão agora: X pontos". Nunca sai da tela nem cobre as cartas. Textos em `CATEGORY_HELP` (`src/ui/texts.js`).

### Mesa (layout)
- Desktop (≥ 1000 px): a mesa ocupa **100dvh sem rolagem**, mesmo no modo Completo: cabeçalho de 1 linha e, abaixo, tabela | cartas e botões | professor. Linhas da tabela, cartas e professor encolhem pela altura da janela (clamp com vh). Precisa caber em 1280×620, 1366×657, 1536×730 e 1920×969.
- Celular: só a tabela rola; cartas, botão "Tirar cartas" e o professor (pequeno) ficam fixos embaixo.
- Conferência: `npm run screenshots` (lista rolagem e posição da dica por tamanho).

### Modos de jogo (inspirados nos modos PvP do Yar)

| id | Nome | Tiradas | Categorias |
|---|---|---|---|
| `basic` | Básico ★ | 3 | ones, twos, threes, fours, fives, sixes |
| `odd` | Ímpares ★★ | 3 | ones, threes, fives, pair, three_kind, chance |
| `even` | Pares ★★ | 3 | twos, fours, sixes, pair, three_kind, chance |
| `pairs` | Duplas ★★★ | 3 | ones … sixes, two_pair, full_house |
| `low` | Baixinhos ★★★ | 3 | ones, twos, threes, pair, two_pair, chance |
| `sequence` | Sequências ★★★★ | 4 | ones … sixes, small_straight, large_straight |
| `no_numbers` | Sem números ★★★★ | 4 | pair, three_kind, four_kind, two_pair, full_house, yar, small_straight, large_straight, chance |
| `full` | Completo ★★★★★ | 4 | todas as 15 |

Os modos ficam num arquivo de dados (`src/core/modes.js`) para serem fáceis de ajustar.

---

## Contra a máquina: Prof. Alishow

A máquina é **o Prof. Alishow** (personagem com poses, frases e reações em `src/ui/characters.js`). O jogador humano só digita o próprio nome. Os 3 níveis de IA aparecem como **modos do professor**:

| nível (`src/ai/`) | Modo | Selo | Frase |
|---|---|---|---|
| `easy` | Prof. Alishow — **Bonzinho** | FÁCIL | "Dá umas colher de chá." |
| `medium` | Prof. Alishow — **Exigente** | MÉDIO | "Joga com estratégia." |
| `hard` | Prof. Alishow — **Banca de Prova** | DIFÍCIL | "Calcula cada probabilidade." |

Todos os níveis usam a mesma interface (`src/ai/`): `decideAction(state, playerId, rng)` → `{ type: 'draw', locks: [5 booleanos] }` ou `{ type: 'score', category }`. As jogadas da máquina aparecem na tela com pequenas pausas (~700 ms) para o jogador acompanhar. Valores esperados por categoria: `src/ai/expectedValues.js`, gerado por `npm run calibrate`; comparação entre níveis: `npm run tournament`.

1. **Fácil (Bonzinho)**: tranca as cartas do valor que mais se repete; para de tirar se já tiver algo bom por acaso; marca a categoria que dá **mais pontos agora** (guloso). 20% de chance de uma escolha aleatória.
2. **Médio (Exigente)**: heurísticas por objetivo (busca trinca/quadra, sequência quando tem 3-4 em sequência, full house quando tem dois pares). Escolhe a categoria comparando os pontos com a **média esperada** daquela categoria (evita gastar Chance ou Yar! cedo, prefere zerar categorias de baixo valor como Uns).
3. **Difícil (Banca de Prova)**: para cada uma das 32 combinações de trancar/não trancar, simula N tiradas (Monte Carlo, ~200 por combinação, respeitando as cartas restantes no baralho) e escolhe a de **maior valor esperado** considerando só as categorias ainda vazias, com pesos que valorizam categorias raras (Yar!, Sequência Maior). Na escolha de categoria usa a mesma lógica do Médio com tabela de valores esperados calibrada por simulação.

Reações do professor (do ponto de vista dele): pensa na vez dele; fica feliz/empolgado/irritado com as próprias jogadas; fica surpreso quando o jogador marca 25+ ou faz Yar!; provoca quando o jogador zera; vitória/derrota/empate no fim. Na mesa ele fica na coluna da direita (lado do adversário), grande, **atrás de uma mesa de professor** (CSS: madeira escura, borda dourada, plaquinha com nome e modo), que cobre o corte das imagens nas coxas; o balão fica ao lado da cabeça; o jogador aparece só com o nome. O enquadramento por pose (`framing`, recorte em px da imagem) deixa a cabeça sempre do mesmo tamanho e altura, e a miniatura do rosto usa `faceCrop` (px da neutral.png) em todos os lugares (tabela, tela inicial, fim de jogo).

---

## Multijogador online (Firebase)

- Todo o código online (`src/online/`, telas em `src/ui/screens/online/`, `src/ui/online.css`) é carregado com **`import()` dinâmico** pelo `app.js`, só quando o jogador escolhe "Online" ou abre um convite (`?sala=CODIGO`). O chunk principal não tem Firebase.
- **Login** (`src/online/auth.js`): "Entrar com Google" (popup) ou "Jogar como convidado" (anônimo) + apelido (até 16 caracteres; vem preenchido com o último usado ou o 1º nome do Google). Telas online mostram quem está logado e "Sair".
- **Salas** (`src/online/rooms.js`, puras em `roomCode.js`/`roomState.js`): o anfitrião escolhe modo e timer no lobby e recebe um **código de 6 caracteres** (sem 0/O, 1/I/L), gerado com transação. Sala de espera: código grande, "Copiar convite" (`https://professoralissonlucas.github.io/yar/?sala=CODIGO`), nomes; o anfitrião clica "Começar" e quem começa é sorteado. Membro sempre pode voltar à sala pelo código (a URL fica com `?sala=` enquanto está nela).
- **Firestore** — coleção `rooms/{code}`:
  - `hostUid`, `guestUid` (null até entrar), `players: { uid: { name } }`, `mode`, `timerEnabled`, `status` (`waiting` | `playing` | `finished`), `createdAt`, `updatedAt`
  - `game`: o estado de `src/core/game.js` (mesmo formato de `createGame`) + `currentUid` (jogador da vez, para as regras)
  - `rev`: sobe 1 a cada gravação que muda o `game` · `match`: nº da partida na sala (0 antes de começar)
  - `presence: { uid: Timestamp }` (lastSeen a cada 20 s) · `rematch: { uid: match }` (voto de revanche da partida atual) · `forfeitUid` (quem perdeu por abandono)
- **Partida** (`src/online/sync.js`): a mesma mesa da partida local, com assentos `controller: 'local'` (eu) e `'remote'` (o amigo); `showTable` recebe `initialState`, `onLocalChange` e devolve `applyRemote`/`resync`. **Somente o jogador da vez** grava, com `runTransaction` conferindo o `rev` (se mudou no meio, descarta e redesenha). Cliques rápidos viram uma gravação só (`pushQueue.js`). As tiradas usam `Math.random` no cliente da vez; o timer (se ligado) é aplicado por quem está na vez.
- **Presença**: sem sinal há 60 s → "Oponente desconectado"; há 2 min → botão "Encerrar partida" (vitória por abandono, conferida pelas regras com o relógio do servidor).
- **Fim**: resultado com "Revanche" (recomeça na mesma sala quando os dois pedem; começa quem não começou a anterior) e "Sair da sala". Sem o professor no online: cada jogador aparece só com o nome.
- Autoritativo no cliente (aceitável entre amigos). As regras (`firestore.rules`, comentadas) garantem quem pode mudar o quê: ninguém lista nem apaga salas; só membros leem (ou qualquer logado, se `waiting`); só o `currentUid` atual muda o `game`; campos fixos nunca mudam; cada um só mexe na própria presença e no próprio voto.
- Salas sem atividade há 24 h não aceitam entrada (podem ser limpas pelo console).
- A configuração do Firebase (`firebaseConfig`) é pública por natureza e pode ir no repositório; a segurança vem das regras e dos domínios autorizados.

---

## Fora do escopo por enquanto
- Design final das cartas e da mesa (será feito depois).
- Ranking, títulos/conquistas, chat.
