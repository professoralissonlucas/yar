import { describe, expect, it } from 'vitest';
import {
  ALISHOW,
  POSES,
  faceStyle,
  getCharacter,
  pickLine,
  poseForReaction,
  poseImageStyle,
  reactToOpponentScore,
  reactToOwnDraw,
  reactToOwnScore,
  resultReaction,
} from '../src/ui/characters.js';
import { NPCS } from '../src/ai/index.js';
import { createSeededRng } from '../src/core/rng.js';

describe('Prof. Alishow', () => {
  it('tem as 8 poses com imagem (via import.meta.glob)', () => {
    for (const pose of POSES) {
      expect(typeof ALISHOW.images[pose]).toBe('string');
      expect(ALISHOW.images[pose]).toMatch(new RegExp(`${pose}\\.png`));
    }
    expect(getCharacter('alishow')).toBe(ALISHOW);
    expect(() => getCharacter('xyz')).toThrow();
  });

  it('tem um modo para cada nível de IA, com título, selo e frase de abertura', () => {
    const titles = Object.fromEntries(NPCS.map((n) => [n.id, ALISHOW.levels[n.id].title]));
    expect(titles).toEqual({ easy: 'Bonzinho', medium: 'Exigente', hard: 'Banca de Prova' });
    for (const { id } of NPCS) {
      expect(ALISHOW.levels[id].badge).toBeTruthy();
      expect(ALISHOW.levels[id].description).toBeTruthy();
      expect(ALISHOW.lines[`greeting_${id}`].length).toBeGreaterThan(0);
    }
    expect(ALISHOW.lines.greeting_easy).toContain('Vou pegar leve, prometo.');
    expect(ALISHOW.lines.greeting_hard).toContain('Espero que tenha estudado.');
  });

  it('cada reação tem frases e uma pose existente', () => {
    for (const reaction of ['thinking', 'happy', 'excited', 'annoyed', 'surprised', 'taunt', 'victory', 'defeat', 'tie']) {
      expect(ALISHOW.lines[reaction].length).toBeGreaterThan(0);
      expect(POSES).toContain(poseForReaction(ALISHOW, reaction));
    }
    expect(poseForReaction(ALISHOW, 'taunt')).toBe('happy');
    expect(poseForReaction(ALISHOW, 'tie')).toBe('happy');
    expect(poseForReaction(ALISHOW, 'greeting')).toBe('neutral');
    expect(ALISHOW.lines.taunt).toEqual(['Zerou? Recuperação pra você!', 'Faltou estudar, hein?']);
  });

  it('recorte do rosto (faceCrop, px da imagem) cabe na imagem', () => {
    const { x, y, size } = ALISHOW.faceCrop;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + size).toBeLessThanOrEqual(ALISHOW.imageSize.width);
    expect(y + size).toBeLessThanOrEqual(ALISHOW.imageSize.height);
  });

  it('miniatura: o quadrado do faceCrop ocupa exatamente a miniatura', () => {
    const character = { ...ALISHOW, faceCrop: { x: 100, y: 20, size: 200 } };
    const style = faceStyle(character, 50); // 0,25 px por px da imagem
    expect(style.backgroundImage).toContain('neutral');
    expect(style.backgroundSize).toBe('108px 144.5px');
    expect(style.backgroundPosition).toBe('-25px -5px');
  });

  it('enquadramento por pose: inteira por padrão; thinking amplia sem sair da imagem', () => {
    expect(poseImageStyle(ALISHOW, 'neutral')).toEqual({ width: '100%', left: '0%', top: '0%' });
    const { width, height } = ALISHOW.imageSize;
    const crop = ALISHOW.framing.thinking;
    expect(crop.x + crop.width).toBeLessThanOrEqual(width);
    expect(crop.y + (crop.width * height) / width).toBeLessThanOrEqual(height);
    const style = poseImageStyle(ALISHOW, 'thinking');
    expect(parseFloat(style.width)).toBeGreaterThan(150);
    expect(parseFloat(style.left)).toBeLessThan(0);
    expect(parseFloat(style.top)).toBeLessThan(0);
    // recorte simples: metade da largura a partir do canto → 200%, deslocado
    const half = { ...ALISHOW, framing: { happy: { x: 216, y: 0, width: 216 } } };
    expect(poseImageStyle(half, 'happy')).toEqual({ width: '200%', left: '-100%', top: '0%' });
  });
});

describe('reações do professor (dono do personagem)', () => {
  it('ele zera → irritado', () => {
    expect(reactToOwnScore({ categoryId: 'ones', points: 0 })).toBe('annoyed');
    expect(reactToOwnScore({ categoryId: 'yar', points: 0 })).toBe('annoyed');
  });

  it('ele marca Yar!, Sequência Maior ou Full House → empolgado', () => {
    expect(reactToOwnScore({ categoryId: 'yar', points: 50 })).toBe('excited');
    expect(reactToOwnScore({ categoryId: 'large_straight', points: 40 })).toBe('excited');
    expect(reactToOwnScore({ categoryId: 'full_house', points: 25 })).toBe('excited');
  });

  it('ele marca Dois Pares, Sequência Menor ou 60%+ numa categoria variável → feliz', () => {
    expect(reactToOwnScore({ categoryId: 'two_pair', points: 15 })).toBe('happy');
    expect(reactToOwnScore({ categoryId: 'small_straight', points: 30 })).toBe('happy');
    expect(reactToOwnScore({ categoryId: 'fives', points: 20 })).toBe('happy'); // 4 cincos
    expect(reactToOwnScore({ categoryId: 'fives', points: 15 })).toBe('happy'); // exatamente 60%
    expect(reactToOwnScore({ categoryId: 'fives', points: 10 })).toBeNull();
    expect(reactToOwnScore({ categoryId: 'chance', points: 18 })).toBe('happy');
    expect(reactToOwnScore({ categoryId: 'chance', points: 17 })).toBeNull();
  });

  it('ele tira 5 iguais ou sequência de 5 → empolgado', () => {
    expect(reactToOwnDraw([3, 3, 3, 3, 3])).toBe('excited');
    expect(reactToOwnDraw([5, 3, 1, 4, 2])).toBe('excited');
    expect(reactToOwnDraw([1, 2, 3, 4, 6])).toBeNull();
    expect(reactToOwnDraw([])).toBeNull();
  });

  it('o jogador zera → provocação (pose feliz)', () => {
    expect(reactToOpponentScore({ categoryId: 'ones', points: 0 })).toBe('taunt');
    expect(reactToOpponentScore({ categoryId: 'yar', points: 0 })).toBe('taunt');
  });

  it('o jogador marca 25+ ou faz Yar! → surpreso', () => {
    expect(reactToOpponentScore({ categoryId: 'full_house', points: 25 })).toBe('surprised');
    expect(reactToOpponentScore({ categoryId: 'chance', points: 26 })).toBe('surprised');
    expect(reactToOpponentScore({ categoryId: 'yar', points: 50 })).toBe('surprised');
    expect(reactToOpponentScore({ categoryId: 'chance', points: 24 })).toBeNull();
  });

  it('resultado: ele vence → victory, perde → defeat, empate → tie (feliz)', () => {
    expect(resultReaction({ won: true, tie: false })).toBe('victory');
    expect(resultReaction({ won: false, tie: false })).toBe('defeat');
    expect(resultReaction({ won: true, tie: true })).toBe('tie');
  });
});

describe('pickLine', () => {
  it('nunca repete a frase anterior quando há alternativa', () => {
    const rng = createSeededRng(3);
    let previous = null;
    for (let i = 0; i < 200; i++) {
      const line = pickLine(ALISHOW, 'taunt', previous, rng);
      expect(ALISHOW.lines.taunt).toContain(line);
      expect(line).not.toBe(previous);
      previous = line;
    }
  });

  it('reação sem frases devolve null; com uma frase pode repetir', () => {
    expect(pickLine(ALISHOW, 'neutral', null, Math.random)).toBeNull();
    expect(pickLine(ALISHOW, 'victory', ALISHOW.lines.victory[0], Math.random)).toBe(ALISHOW.lines.victory[0]);
  });
});
