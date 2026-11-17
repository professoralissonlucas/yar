import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS, FIXED_SCORES, getCategory } from '../src/core/scoring.js';
import { CATEGORY_HELP, categoryDescription, categoryHelp } from '../src/ui/texts.js';

describe('CATEGORY_HELP (dica das categorias)', () => {
  it('tem explicação para as 15 categorias, e só para elas', () => {
    expect(Object.keys(CATEGORY_HELP).sort()).toEqual([...CATEGORY_IDS].sort());
  });

  it.each(CATEGORY_IDS)('%s: regra, pontuação e exemplo de 5 cartas que pontua', (id) => {
    const help = categoryHelp(id);
    expect(help.name).toBe(getCategory(id).name);
    expect(help.rule.length).toBeGreaterThan(5);
    expect(help.example).toHaveLength(5);
    for (const v of help.example) expect(v >= 1 && v <= 6 && Number.isInteger(v)).toBe(true);
    expect(help.exampleScore).toBeGreaterThan(0);
    expect(help.exampleScore).toBeLessThanOrEqual(getCategory(id).max);
    expect(help.handLine).toBeNull();
  });

  it('pontuação: variáveis mostram o máximo; fixas mostram o valor', () => {
    expect(categoryHelp('three_kind').pointsLine).toBe('Vale a soma das 3 cartas iguais · máx. 18');
    expect(categoryHelp('four_kind').pointsLine).toContain('máx. 24');
    expect(categoryHelp('full_house').pointsLine).toBe('Vale 25 pontos');
    for (const id of Object.keys(FIXED_SCORES)) {
      expect(categoryHelp(id).pointsLine).toBe(`Vale ${FIXED_SCORES[id]} pontos`);
    }
  });

  it('exemplo da Trinca: 5 5 5 2 6 → 15', () => {
    const help = categoryHelp('three_kind');
    expect(help.example).toEqual([5, 5, 5, 2, 6]);
    expect(help.exampleScore).toBe(15);
  });

  it('"Sua mão agora" só aparece com os pontos da mão', () => {
    expect(categoryHelp('pair', 12).handLine).toBe('Sua mão agora: 12 pontos');
    expect(categoryHelp('ones', 1).handLine).toBe('Sua mão agora: 1 ponto');
    expect(categoryHelp('yar', 0).handLine).toBe('Sua mão agora: 0 pontos');
    expect(categoryHelp('pair', null).handLine).toBeNull();
  });

  it('descrição para leitor de tela: regra, pontuação, exemplo (A no lugar do 1) e mão', () => {
    const text = categoryDescription('ones', 3);
    expect(text).toContain(CATEGORY_HELP.ones.rule);
    expect(text).toContain('máx. 5');
    expect(text).toContain('Exemplo: A, A, 4, A, 6 vale 3 pontos.');
    expect(text).toContain('Sua mão agora: 3 pontos.');
    expect(categoryDescription('chance')).not.toContain('Sua mão agora');
  });
});
