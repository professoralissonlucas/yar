/**
 * Prints para conferência visual (modo Completo, contra o Prof. Alishow).
 * - 1280×800 e 390×750: tela inicial, mesa (jogador, dica aberta, professor),
 *   fim de jogo e mesa local.
 * - 1366×657, 1536×730, 1920×969 e 1280×620 (área útil de navegadores comuns):
 *   só a mesa (jogador, dica aberta, professor); depois sai da partida.
 * Em cada print: há rolagem na página? cartas e botão inteiros na janela?
 * Na vez do jogador, abre a dica de todas as categorias (Tab) e confere que
 * ela não sai da tela nem cobre as cartas. No fim, imprime um resumo.
 *
 * Uso: npm run screenshots   (faz o build e roda este script)
 * Saída: screenshots/*.png
 *
 * - Sobe o `vite preview` numa porta livre (127.0.0.1).
 * - Navegador e servidor são fechados sempre: no fim, em caso de erro e no Ctrl+C.
 * - Math.random com semente → partidas reproduzíveis.
 * - page.clock acelera as pausas da máquina; animações desligadas no print.
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
const VITE = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const HOST = '127.0.0.1';
const BASE_PATH = '/yar/';
const SEED = 20261117;
const PREVIEW_ATTEMPTS = 3;
const PREVIEW_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;
const STDERR_LIMIT = 4096;
const VIEWPORTS = [
  { name: '1280x800', full: true, viewport: { width: 1280, height: 800 } },
  { name: '390x750', full: true, viewport: { width: 390, height: 750 }, isMobile: true, hasTouch: true },
  { name: '1366x657', viewport: { width: 1366, height: 657 } },
  { name: '1536x730', viewport: { width: 1536, height: 730 } },
  { name: '1920x969', viewport: { width: 1920, height: 969 } },
  { name: '1280x620', viewport: { width: 1280, height: 620 } },
];

/** Resultado das checagens de cada print (resumo no fim). */
const results = [];
const tipReports = [];

/** Recursos abertos, para o cleanup (inclusive no Ctrl+C). */
let activePreview = null;
let activeBrowser = null;

// ---------------------------------------------------------------- servidor

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function spawnPreview(port) {
  const child = spawn(
    process.execPath,
    [VITE, 'preview', '--host', HOST, '--port', String(port), '--strictPort'],
    // stdout ignorado (ninguém lê → o pipe não pode encher e travar o vite)
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
  );
  const preview = { child, url: `http://${HOST}:${port}${BASE_PATH}`, stderr: '', exit: null };
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    preview.stderr = (preview.stderr + chunk).slice(-STDERR_LIMIT);
  });
  preview.exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve((preview.exit = { code, signal })));
    child.once('error', (error) => resolve((preview.exit = { error })));
  });
  activePreview = preview;
  return preview;
}

function describeExit({ code, signal, error }) {
  if (error) return error.message;
  return signal ? `sinal ${signal}` : `código ${code}`;
}

async function waitUntilReady(preview) {
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (preview.exit) {
      throw new Error(`vite preview saiu antes de responder (${describeExit(preview.exit)})\n${preview.stderr}`);
    }
    try {
      const response = await fetch(preview.url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok && !preview.exit) return;
    } catch {
      // ainda subindo
    }
    await delay(150);
  }
  throw new Error(`vite preview não respondeu em ${PREVIEW_TIMEOUT_MS / 1000} s\n${preview.stderr}`);
}

/** Sobe o preview; se falhar (ex.: alguém pegou a porta), tenta outra porta. */
async function startPreview() {
  let lastError;
  for (let attempt = 1; attempt <= PREVIEW_ATTEMPTS; attempt++) {
    const preview = spawnPreview(await freePort());
    try {
      await waitUntilReady(preview);
      return preview;
    } catch (error) {
      lastError = error;
      await stopPreview(preview);
    }
  }
  throw lastError;
}

async function stopPreview(preview) {
  if (!preview) return;
  if (!preview.exit) {
    preview.child.kill();
    const result = await Promise.race([preview.exited, delay(STOP_TIMEOUT_MS, 'timeout', { ref: false })]);
    if (result === 'timeout') preview.child.kill('SIGKILL');
  }
  if (activePreview === preview) activePreview = null;
}

// ---------------------------------------------------------------- cleanup

let cleanupPromise = null;

function cleanup() {
  cleanupPromise ??= (async () => {
    try {
      await activeBrowser?.close();
    } catch (error) {
      console.warn('  ! erro ao fechar o navegador:', error.message);
    }
    activeBrowser = null;
    try {
      await stopPreview(activePreview);
    } catch (error) {
      console.warn('  ! erro ao parar o vite preview:', error.message);
    }
  })();
  return cleanupPromise;
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  // `once`: um segundo Ctrl+C mata na hora, se o cleanup travar
  process.once(signal, () => {
    console.warn(`\n${signal}: fechando navegador e servidor…`);
    cleanup().finally(() => process.exit(code));
  });
}

// último recurso: o processo vai sair e o filho ainda está vivo
process.on('exit', () => {
  if (activePreview && !activePreview.exit) activePreview.child.kill();
});

// ---------------------------------------------------------------- prints

/** Math.random com semente (mulberry32), injetado antes do app. */
function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rolagem da página e visibilidade das cartas/botão (no navegador). */
function measureLayout() {
  const de = document.documentElement;
  const whole = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5;
  };
  const panel = document.querySelector('.table-screen .score-panel');
  return {
    vScroll: de.scrollHeight > innerHeight,
    hScroll: de.scrollWidth > innerWidth,
    scrollHeight: de.scrollHeight,
    innerHeight,
    cards: whole(document.querySelector('.table-screen .hand')),
    button: whole(document.querySelector('.table-screen .draw-button')),
    tableScrolls: panel ? panel.scrollHeight > panel.clientHeight + 1 : null,
  };
}

/**
 * Abre a dica de cada categoria pelo foco (como no Tab) e confere que ela
 * abre, não sai da tela e não cobre as cartas. Roda no navegador.
 */
function sweepTips() {
  const problems = [];
  const buttons = [...document.querySelectorAll('.table-screen .cat-name')];
  for (const btn of buttons) {
    const id = btn.dataset.catTip;
    btn.scrollIntoView({ block: 'nearest' });
    btn.focus();
    const tip = document.querySelector('.cat-tip');
    if (!tip || tip.hidden) {
      problems.push(`${id}: não abriu`);
      continue;
    }
    const r = tip.getBoundingClientRect();
    const hand = document.querySelector('.table-screen .hand')?.getBoundingClientRect();
    if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) problems.push(`${id}: sai da tela`);
    if (hand && r.left < hand.right && hand.left < r.right && r.top < hand.bottom && hand.top < r.bottom) {
      problems.push(`${id}: cobre as cartas`);
    }
    const describedBy = btn.getAttribute('aria-describedby');
    if (!describedBy || !document.getElementById(describedBy)?.textContent) {
      problems.push(`${id}: sem aria-describedby`);
    }
  }
  document.activeElement?.blur();
  return { checked: buttons.length, problems };
}

async function shoot(page, name, size) {
  const file = `${name}-${size}.png`;
  await page.screenshot({ path: `${OUT}${file}`, fullPage: true, animations: 'disabled' });
  const layout = await page.evaluate(measureLayout);
  results.push({ print: file, ...layout });
  const flag = layout.vScroll || layout.hScroll ? '  ! ROLAGEM' : '';
  console.log('  ✓', `screenshots/${file}`, flag);
}

/** Dica aberta (mouse no desktop, toque no celular) + varredura de todas as categorias. */
async function checkTips(page, size, touch) {
  const trigger = page.locator('.cat-name').filter({ hasText: 'Trinca' });
  if (touch) await trigger.tap();
  else await trigger.hover();
  const tip = page.locator('.cat-tip');
  if (!(await tip.isVisible())) throw new Error('a dica da Trinca não abriu');
  const text = await tip.innerText();
  if (!text.includes('Sua mão agora')) console.warn('  ! a dica não mostrou "Sua mão agora"');
  await shoot(page, 'tip', size);
  if (touch) {
    await trigger.tap(); // toca de novo: fecha
    if (await tip.isVisible()) console.warn('  ! tocar de novo não fechou a dica');
  } else {
    await page.mouse.move(1, 1);
    if (await tip.isVisible()) console.warn('  ! tirar o mouse não fechou a dica');
  }
  // o relógio é falso (page.clock): avança para sair da janela "foco logo
  // depois de um toque", que no uso real dura 0,8 s
  await page.clock.runFor(1000);
  await page.keyboard.press('Shift'); // foco "de teclado" (:focus-visible)
  const report = await page.evaluate(sweepTips);
  tipReports.push({ size, ...report });
  console.log(`  ✓ dica conferida em ${report.checked} categorias`, report.problems.length ? report.problems : '');
}

async function run(browser, url, { name: size, full = false, ...contextOptions }) {
  console.log(size);
  const touch = Boolean(contextOptions.hasTouch);
  const context = await browser.newContext({ ...contextOptions, locale: 'pt-BR' });
  try {
    await context.addInitScript(seedRandom, SEED);
    const page = await context.newPage();
    await page.clock.install();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    // ---- tela inicial: contra a máquina, nome preenchido ----
    await page.goto(url);
    await page.getByText('Contra a máquina', { exact: true }).first().click();
    const nameInput = page.getByRole('textbox', { name: 'Seu nome' });
    await nameInput.fill('   ');
    const play = page.getByRole('button', { name: 'Jogar' });
    if (!(await play.isDisabled())) throw new Error('"Jogar" deveria ficar desabilitado sem nome');
    if (full) console.log('  ✓ "Jogar" desabilitado sem nome:', await page.locator('.form-hint').textContent());
    await nameInput.fill('Ana');
    if (!(await play.isEnabled())) throw new Error('"Jogar" deveria habilitar com nome');
    await page.locator('label.option--level').filter({ hasText: 'Exigente' }).click();
    await page.locator('label.option--mode').filter({ hasText: 'Completo' }).click();
    await page.waitForTimeout(50);
    if (full) await shoot(page, 'home', size);

    // ---- partida ----
    await page.getByRole('button', { name: 'Jogar' }).click();
    const shots = { player: false, professor: false };
    let finished = false;

    for (let step = 0; step < 4000; step++) {
      if (await page.locator('.gameover-screen').count()) {
        finished = true;
        break;
      }
      if (!full && shots.player && shots.professor) break;

      const notice = page.locator('.overlay--notice');
      if (await notice.count()) {
        await notice.click();
        await page.clock.runFor(60);
        continue;
      }
      const dialog = page.locator('.dialog');
      if (await dialog.count()) {
        await dialog.locator('.btn--danger').click();
        await page.clock.runFor(60);
        continue;
      }

      const professorTurn = await page.locator('.seat--top.seat--active').count();
      if (professorTurn) {
        // print quando ele está pensando e falando (depois da saudação inicial)
        const thinking = await page.locator('.avatar[data-pose="thinking"][data-speaking]').count();
        if (!shots.professor && thinking) {
          await shoot(page, 'table-professor', size);
          shots.professor = true;
        }
        await page.clock.runFor(700);
        continue;
      }

      const drawButton = page.locator('.draw-button');
      if ((await drawButton.count()) && (await page.locator('.card--back').count()) === 5) {
        if (await drawButton.isEnabled()) {
          await drawButton.click();
          await page.clock.runFor(60);
          continue;
        }
        await page.clock.runFor(100);
        continue;
      }

      const previews = page.locator('button.preview');
      if (await previews.count()) {
        if (!shots.player) {
          await page.locator('button.card').first().click(); // uma carta trancada
          await shoot(page, 'table-player', size);
          await checkTips(page, size, touch);
          shots.player = true;
        }
        const good = page.locator('button.preview:not(.preview--zero)');
        await ((await good.count()) ? good.last() : previews.first()).click();
        await page.clock.runFor(60);
        continue;
      }
      await page.clock.runFor(100);
    }
    if (!shots.player || !shots.professor) console.warn('  ! faltou print da mesa:', shots);

    if (!full) {
      // só a mesa: sai da partida
      await page.getByRole('button', { name: 'Sair', exact: true }).click();
      await page.locator('.dialog .btn--danger').click();
      await page.clock.runFor(60);
    } else {
      if (!finished) throw new Error('a partida não terminou');
      await page.clock.runFor(3000); // balão e animação do resultado
      await shoot(page, 'gameover', size);

      // ---- modo local (2 jogadores): mesa sem personagem ----
      await page.getByRole('button', { name: 'Voltar ao início' }).click();
      await page.getByText('2 jogadores', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Jogar' }).click();
      await page.locator('.overlay--notice').click();
      await page.clock.runFor(60);
      await page.locator('.draw-button').click();
      await page.clock.runFor(60);
      await shoot(page, 'table-local', size);
    }
    if (errors.length) console.warn('  ! erros no console:', errors);
  } finally {
    await context.close().catch(() => {});
  }
}

function printSummary() {
  const yesNo = (v) => (v == null ? '—' : v ? 'sim' : 'não');
  console.log('\nResumo (rolagem = document.documentElement.scrollHeight > innerHeight):');
  console.table(
    results.map((r) => ({
      print: r.print,
      'rolagem vertical': yesNo(r.vScroll),
      'rolagem horizontal': yesNo(r.hScroll),
      'scrollHeight / innerHeight': `${r.scrollHeight} / ${r.innerHeight}`,
      'cartas inteiras': yesNo(r.cards),
      'botão inteiro': yesNo(r.button),
      'tabela rola por dentro': yesNo(r.tableScrolls),
    })),
  );
  for (const t of tipReports) {
    console.log(`dica ${t.size}: ${t.checked} categorias,`, t.problems.length ? `problemas: ${t.problems.join('; ')}` : 'ok');
  }
}

// ---------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true });
try {
  const preview = await startPreview();
  console.log('vite preview em', preview.url);
  activeBrowser = await chromium.launch();
  for (const options of VIEWPORTS) await run(activeBrowser, preview.url, options);
} catch (error) {
  process.exitCode = 1;
  console.error('\n✗', error?.stack ?? error);
} finally {
  await cleanup();
  if (results.length) printSummary();
}
