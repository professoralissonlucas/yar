/**
 * Diagnóstico de gravações recusadas (só no `npm run dev`): compara a sala
 * como estava (`before`) com o objeto que o cliente tentou gravar (`after`,
 * no formato do tx.update — chaves com ponto como `presence.<uid>` valem como
 * caminho) e lista só o que mudou. Puro, sem Firebase.
 */

/** Sentinela do Firestore (serverTimestamp(), deleteField()…)? */
function sentinelName(value) {
  const method = value?._methodName; // FieldValue do SDK modular
  if (typeof method === 'string') return `${method.replace(/^FieldValue\./, '')}()`;
  return null;
}

/** Valor curto para mostrar numa linha. */
export function show(value) {
  if (value === undefined) return '(ausente)';
  if (value === null) return 'null';
  const sentinel = sentinelName(value);
  if (sentinel) return sentinel;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return String(value);
    }
  }
  if (Array.isArray(value)) {
    return value.length > 8 ? `[${value.length} itens]` : JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(value);
}

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !sentinelName(v) && typeof v.toDate !== 'function';

/** Valor no caminho `a.b.c` (undefined se não existir). */
function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** Linhas "caminho: antes → depois" com as diferenças entre a e b. */
function diffValues(path, a, b, out) {
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) diffValues(path ? `${path}.${key}` : key, a[key], b[key], out);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${path}: ${a.length} itens → ${b.length} itens  (${show(a)} → ${show(b)})`);
      return;
    }
    a.forEach((item, i) => diffValues(`${path}[${i}]`, item, b[i], out));
    return;
  }
  if (show(a) !== show(b) || typeof a !== typeof b) out.push(`${path}: ${show(a)} → ${show(b)}`);
}

/**
 * O que a gravação muda: para cada campo de `after` (chaves com ponto =
 * caminho), compara com o valor em `before`. `before` null = documento novo.
 */
export function describeChanges(before, after) {
  const out = [];
  for (const key of Object.keys(after ?? {}).sort()) {
    diffValues(key, before == null ? undefined : getPath(before, key), after[key], out);
  }
  return out;
}

/** Mostra no console (só em dev) a gravação recusada. */
export function logDeniedWrite(error) {
  const debug = error?.debug;
  if (!debug) return;
  const lines = describeChanges(debug.before, debug.after);
  console.groupCollapsed(`[Yar online] gravação recusada pelas regras: ${debug.action}`);
  console.log('O que mudou (antes → depois):\n' + (lines.length ? lines.join('\n') : '(nada)'));
  console.log('Sala ANTES:', debug.before);
  console.log('Gravação tentada:', debug.after);
  console.log('Erro:', error);
  console.groupEnd();
}
