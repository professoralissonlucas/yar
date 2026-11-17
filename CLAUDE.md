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
3. Clica em **"Tirar cartas"** de novo para trocar as não trancadas. O total de tiradas por turno é **3 ou 4**, conforme o modo (botão mostra `Tirar cartas (1/3)`).
4. A qualquer momento depois da 1ª tirada, o jogador escolhe **uma categoria ainda vazia** na tabela para marcar os pontos da mão atual. Isso encerra o turno.
5. Se nenhuma categoria pontuar, ele **é obrigado a zerar** uma categoria vazia.
6. **Timer opcional de 45 s** por turno (ligável nas opções). Se acabar: marca automaticamente a categoria vazia de maior pontuação; se todas dariam 0, zera a de menor potencial (ordem: Fragmento Um, Dois Pacotes, …).

### Partida
- Os jogadores alternam turnos. Cada categoria só pode ser marcada **uma vez por jogador**.
- O número de turnos de cada jogador = número de categorias do modo escolhido.
- A partida termina quando todos preencherem todas as categorias. **Vence quem somar mais pontos**; empate é possível.
- Sem bônus de seção superior (diferente do Yahtzee clássico).

### Categorias (nomes da versão PT-BR do BDO)

| id | Nome | Pontuação | Regra |
|---|---|---|---|
| `ones` | Fragmento Um | 0–5 | Soma das cartas 1 |
| `twos` | Dois Pacotes | 0–10 | Soma das cartas 2 |
| `threes` | Três Pacotes | 0–15 | Soma das cartas 3 |
| `fours` | Quatro Motivos | 0–20 | Soma das cartas 4 |
| `fives` | Cinco Caroços | 0–25 | Soma das cartas 5 |
| `sixes` | Seis Buquês | 0–30 | Soma das cartas 6 |
| `pair` | Parceiro | 0–12 | Pelo menos 2 iguais → soma **só do par de maior valor** (6,6,x,x,x = 12) |
| `three_kind` | Pico | 0–18 | Pelo menos 3 iguais → soma **só dessas 3** |
| `four_kind` | Garra de Dragão | 0–24 | Pelo menos 4 iguais → soma **só dessas 4** |
| `two_pair` | Rude | 0 ou 15 | Dois pares de **valores diferentes** (vale também com full house: 3,3,3,5,5). Quadra sozinha não conta |
| `full_house` | Sedução do Lobo | 0 ou 25 | Exatamente 3 de um valor + 2 de **outro** valor. Cinco iguais não contam |
| `yar` | Yar! | 0 ou 50 | 5 cartas iguais |
| `small_straight` | Estrada Bifurcada | 0 ou 30 | 4 valores em sequência (1-2-3-4, 2-3-4-5 ou 3-4-5-6), ordem não importa |
| `large_straight` | Corda | 0 ou 40 | 5 valores em sequência (1-2-3-4-5 ou 2-3-4-5-6), ordem não importa |
| `chance` | Kkakdugi | 5–30 | Soma de todas as 5 cartas |

Observação: a fonte em inglês lista Garra de Dragão como 0–20, mas o máximo real (quatro 6) é 24 — usar 24.

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

## NPCs (contra a máquina)

Todos usam a mesma interface (`src/ai/`): `decideAction(state, playerId, rng)` → `{ type: 'draw', locks: [5 booleanos] }` ou `{ type: 'score', category }`. Jogadas do NPC aparecem na tela com pequenas pausas (~700 ms) para o jogador acompanhar. Valores esperados por categoria: `src/ai/expectedValues.js`, gerado por `npm run calibrate`; comparação entre níveis: `npm run tournament`.

1. **Fácil — "Igor"**: tranca as cartas do valor que mais se repete; para de tirar se já tiver algo bom por acaso; marca a categoria que dá **mais pontos agora** (guloso). 20% de chance de uma escolha aleatória.
2. **Médio — "Eileen"**: heurísticas por objetivo (busca trinca/quadra, sequência quando tem 3-4 em sequência, full house quando tem dois pares). Escolhe a categoria comparando os pontos com a **média esperada** daquela categoria (evita gastar Kkakdugi ou Yar! cedo, prefere zerar categorias de baixo valor como Fragmento Um).
3. **Difícil — "Islin"**: para cada uma das 32 combinações de trancar/não trancar, simula N tiradas (Monte Carlo, ~200 por combinação, respeitando as cartas restantes no baralho) e escolhe a de **maior valor esperado** considerando só as categorias ainda vazias, com pesos que valorizam categorias raras (Yar!, Corda). Na escolha de categoria usa a mesma lógica do Médio com tabela de valores esperados calibrada por simulação.

---

## Multijogador online (Firebase)

- **Login**: Google ou "Entrar como convidado" (auth anônima) + apelido.
- **Salas**: o anfitrião cria uma sala, escolhe o modo e recebe um **código de 6 caracteres** (sem letras ambíguas: sem 0/O, 1/I/L). O amigo entra digitando o código.
- **Firestore** — coleção `rooms/{code}`:
  - `hostUid`, `guestUid`, `players: { uid: { name } }`, `mode`, `status` (`waiting` | `playing` | `finished`), `createdAt`, `updatedAt`
  - `game`: `currentUid`, `turnIndex`, `hand` (5 valores), `locked` (5 booleanos), `drawsUsed`, `deck` (cartas restantes do turno), `scores: { uid: { categoryId: number | null } }`
- Sincronização em tempo real com `onSnapshot`. **Somente o jogador da vez** grava mudanças no `game` (usar transação).
- Autoritativo no cliente (aceitável para jogos entre amigos). As regras de segurança do Firestore garantem: só membros da sala leem/escrevem; só o jogador da vez altera o `game`.
- Salas `finished` ou sem atividade há 24 h podem ser ignoradas/limpas.
- A configuração do Firebase (`firebaseConfig`) é pública por natureza e pode ir no repositório; a segurança vem das regras e dos domínios autorizados.

---

## Fora do escopo por enquanto
- Design final das cartas e da mesa (será feito depois).
- Ranking, títulos/conquistas, chat.
