/**
 * Prints para conferência visual: tela inicial, mesa (vez do jogador e vez do
 * professor) e fim de jogo, em 1280 px e 390 px de largura.
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
  { name: '1280', viewport: { width: 1280, height: 800 } },
  { name: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

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

async function shoot(page, name, size) {
  const path = `${OUT}${name}-${size}.png`;
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  console.log('  ✓', `screenshots/${name}-${size}.png`);
}

async function run(browser, url, { name: size, ...contextOptions }) {
  console.log(`${size} px`);
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
    console.log('  ✓ "Jogar" desabilitado sem nome:', await page.locator('.form-hint').textContent());
    await nameInput.fill('Ana');
    if (!(await play.isEnabled())) throw new Error('"Jogar" deveria habilitar com nome');
    await page.locator('label.option--level').filter({ hasText: 'Exigente' }).click();
    await page.locator('label.option--mode').filter({ hasText: 'Completo' }).click();
    await page.waitForTimeout(50);
    await shoot(page, 'home', size);

    // ---- partida ----
    await page.getByRole('button', { name: 'Jogar' }).click();
    const shots = { player: false, professor: false };

    for (let step = 0; step < 4000; step++) {
      if (await page.locator('.gameover-screen').count()) break;

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
          shots.player = true;
        }
        const good = page.locator('button.preview:not(.preview--zero)');
        await ((await good.count()) ? good.last() : previews.first()).click();
        await page.clock.runFor(60);
        continue;
      }
      await page.clock.runFor(100);
    }

    await page.clock.runFor(3000); // balão e animação do resultado
    await shoot(page, 'gameover', size);
    if (!shots.player || !shots.professor) console.warn('  ! faltou print da mesa:', shots);

    // ---- modo local (2 jogadores): mesa sem personagem ----
    await page.getByRole('button', { name: 'Voltar ao início' }).click();
    await page.getByText('2 jogadores', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Jogar' }).click();
    await page.locator('.overlay--notice').click();
    await page.clock.runFor(60);
    await page.locator('.draw-button').click();
    await page.clock.runFor(60);
    await shoot(page, 'table-local', size);
    if (errors.length) console.warn('  ! erros no console:', errors);
  } finally {
    await context.close().catch(() => {});
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
}
