import { describe, expect, it } from 'vitest';
import { accountLabel, cleanNickname, firstName, suggestNickname } from '../../src/online/nickname.js';

describe('cleanNickname', () => {
  it('tira espaços e limita a 16 caracteres', () => {
    expect(cleanNickname('   Ana   Maria  ')).toBe('Ana Maria');
    expect(cleanNickname('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmnop');
    expect(cleanNickname(null)).toBe('');
  });

  it('não corta emoji ao meio e não termina com espaço', () => {
    expect(cleanNickname('😀'.repeat(20))).toBe('😀'.repeat(16));
    expect(cleanNickname('123456789012345 7')).toBe('123456789012345');
  });
});

describe('suggestNickname', () => {
  const google = { displayName: 'Alisson Lucas Souza', isAnonymous: false };

  it('prefere o último apelido usado', () => {
    expect(suggestNickname(google, 'Prof')).toBe('Prof');
  });

  it('usa o primeiro nome da conta Google', () => {
    expect(suggestNickname(google, '')).toBe('Alisson');
    expect(firstName('  Bia  ')).toBe('Bia');
  });

  it('fica vazio para convidado sem apelido anterior', () => {
    expect(suggestNickname({ displayName: null, isAnonymous: true }, undefined)).toBe('');
  });
});

describe('accountLabel', () => {
  it('mostra o tipo de conta', () => {
    expect(accountLabel({ isAnonymous: true }, 'Zé')).toBe('Zé (convidado)');
    expect(accountLabel({ isAnonymous: false, displayName: 'Ana B' }, null)).toBe('Ana (Google)');
  });
});
