import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../src/core/rng.js';
import {
  ROOM_CODE_ALPHABET,
  extractRoomCode,
  generateRoomCode,
  inviteUrl,
  isValidRoomCode,
  normalizeRoomCode,
  roomCodeFromSearch,
} from '../../src/online/roomCode.js';

describe('alfabeto dos códigos', () => {
  it('não tem caracteres ambíguos (0/O, 1/I/L)', () => {
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
    expect(ROOM_CODE_ALPHABET).toHaveLength(31);
  });
});

describe('generateRoomCode', () => {
  it('gera 6 caracteres válidos', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
    }
  });

  it('é determinístico com seed e usa as pontas do alfabeto', () => {
    expect(generateRoomCode(createSeededRng(1))).toBe(generateRoomCode(createSeededRng(1)));
    expect(generateRoomCode(() => 0)).toBe('222222');
    expect(generateRoomCode(() => 0.9999999)).toBe('ZZZZZZ');
  });

  it('exige um rng', () => {
    expect(() => generateRoomCode()).toThrow(TypeError);
  });
});

describe('normalizeRoomCode / isValidRoomCode', () => {
  it('deixa em maiúsculas e tira espaços, traços e caracteres inválidos', () => {
    expect(normalizeRoomCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ab0o1il9')).toBe('AB9');
    expect(normalizeRoomCode('ABCDEFGH')).toBe('ABCDEF');
    expect(normalizeRoomCode(null)).toBe('');
  });

  it('só aceita 6 caracteres do alfabeto', () => {
    expect(isValidRoomCode('ABC234')).toBe(true);
    expect(isValidRoomCode('abc234')).toBe(false);
    expect(isValidRoomCode('ABC23')).toBe(false);
    expect(isValidRoomCode('ABC2340')).toBe(false);
    expect(isValidRoomCode('ABCO23')).toBe(false);
    expect(isValidRoomCode(undefined)).toBe(false);
  });
});

describe('extractRoomCode (campo "Entrar com código")', () => {
  it('aceita o link do convite inteiro', () => {
    expect(extractRoomCode('https://professoralissonlucas.github.io/yar/?sala=ABC234')).toBe('ABC234');
    expect(extractRoomCode(inviteUrl('K7PX4M'))).toBe('K7PX4M');
  });

  it('acha o código no meio de um texto ou com outros parâmetros', () => {
    expect(extractRoomCode('bora jogar? https://x.dev/yar/?sala=abc234 vem')).toBe('ABC234');
    expect(extractRoomCode('https://x.dev/yar/?utm=zap&sala=abc-234&y=1')).toBe('ABC234');
    expect(extractRoomCode('localhost:5173/yar/#x?SALA=k7px4m')).toBe('K7PX4M');
  });

  it('sem link, trata o texto como o código', () => {
    expect(extractRoomCode(' abc 234 ')).toBe('ABC234');
    expect(extractRoomCode('ABC234')).toBe('ABC234');
    expect(extractRoomCode('')).toBe('');
    expect(extractRoomCode(null)).toBe('');
  });

  it('link sem código vira vazio (não pega letras da URL)', () => {
    expect(extractRoomCode('https://professoralissonlucas.github.io/yar/?sala=')).toBe('');
  });
});

describe('convite', () => {
  it('monta o link do GitHub Pages', () => {
    expect(inviteUrl('ABC234')).toBe('https://professoralissonlucas.github.io/yar/?sala=ABC234');
  });

  it('lê o código da query string', () => {
    expect(roomCodeFromSearch('?sala=abc234')).toBe('ABC234');
    expect(roomCodeFromSearch('?x=1&sala=ABC-234')).toBe('ABC234');
    expect(roomCodeFromSearch('?sala=AB')).toBeNull();
    expect(roomCodeFromSearch('')).toBeNull();
  });
});
