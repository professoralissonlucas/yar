/**
 * GERADO por scripts/calibrate.js — não edite à mão (rode `npm run calibrate`).
 *
 * Valor esperado de cada categoria em um turno jogando só para ela, por número
 * de tiradas do modo. Simulação com o baralho real de 36 cartas.
 * Turnos por categoria: 10000 · semente: 12345 · gerado em: 2026-11-17
 */
export const EXPECTED_VALUES = {
  3: {
    ones: 2.16,
    twos: 4.32,
    threes: 6.5,
    fours: 8.68,
    fives: 10.78,
    sixes: 12.95,
    pair: 10.83,
    three_kind: 8.57,
    four_kind: 2.58,
    two_pair: 10.88,
    full_house: 7.27,
    yar: 0.52,
    small_straight: 21.61,
    large_straight: 13.53,
    chance: 23.52,
  },
  4: {
    ones: 2.67,
    twos: 5.32,
    threes: 7.98,
    fours: 10.73,
    fives: 13.46,
    sixes: 15.99,
    pair: 11.47,
    three_kind: 11.71,
    four_kind: 5.14,
    two_pair: 12.69,
    full_house: 10.9,
    yar: 1.17,
    small_straight: 25.73,
    large_straight: 19.84,
    chance: 24.94,
  },
};
