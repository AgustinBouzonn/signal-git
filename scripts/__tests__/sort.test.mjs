import test from "node:test";
import assert from "node:assert/strict";
import "../../src/sort.js";

const { SORTS, DEFAULT_SORT, sortRepos, momentum } = globalThis.SignalSort;

const repo = (over = {}) => ({
  fullName: 'x/y', stars: 1000, growthRate: 10, isEstimated: false,
  ageInDays: 100, forks: 10, pushedAt: '2026-08-01T00:00:00Z', ...over
});

const nombres = (list, mode) => sortRepos(list, mode).map(r => r.fullName);

test("existen los seis criterios y el default es crecimiento", () => {
  assert.deepEqual(Object.keys(SORTS), ['growth','momentum','stars','newest','active','forks']);
  assert.equal(DEFAULT_SORT, 'growth');
  Object.values(SORTS).forEach(s => {
    assert.equal(typeof s.compare, 'function');
    assert.ok(s.label && s.hint);
  });
});

test("sortRepos no muta la lista original", () => {
  const list = [repo({ fullName: 'a', stars: 1 }), repo({ fullName: 'b', stars: 9 })];
  const copia = list.map(r => r.fullName);
  sortRepos(list, 'stars');
  assert.deepEqual(list.map(r => r.fullName), copia);
});

test("un modo desconocido cae en el orden por defecto", () => {
  const list = [repo({ fullName: 'lento', growthRate: 1 }), repo({ fullName: 'rapido', growthRate: 99 })];
  assert.deepEqual(nombres(list, 'inventado'), nombres(list, 'growth'));
  assert.deepEqual(nombres(list, undefined), ['rapido', 'lento']);
});

test("crecimiento: ordena por tasa diaria y deja los estimados al final", () => {
  const list = [
    repo({ fullName: 'medido-lento', growthRate: 5 }),
    repo({ fullName: 'estimado-enorme', growthRate: 9999, isEstimated: true }),
    repo({ fullName: 'medido-rapido', growthRate: 80 })
  ];
  assert.deepEqual(nombres(list, 'growth'), ['medido-rapido', 'medido-lento', 'estimado-enorme']);
});

test("momentum: el repo chico que se mueve gana al grande que suma mas", () => {
  const list = [
    repo({ fullName: 'gigante', stars: 200000, growthRate: 300 }),
    repo({ fullName: 'chico',   stars: 800,    growthRate: 120 })
  ];
  assert.deepEqual(nombres(list, 'momentum'), ['chico', 'gigante']);
  // por crecimiento absoluto el orden es el inverso
  assert.deepEqual(nombres(list, 'growth'), ['gigante', 'chico']);
});

test("momentum: el piso evita que un repo diminuto domine por ruido", () => {
  const diminuto = repo({ stars: 3, growthRate: 3 });
  const solido   = repo({ stars: 900, growthRate: 300 });
  assert.ok(momentum(solido) > momentum(diminuto));
});

test("momentum tambien posterga a los estimados", () => {
  const list = [
    repo({ fullName: 'est', stars: 10, growthRate: 5000, isEstimated: true }),
    repo({ fullName: 'med', stars: 100000, growthRate: 1 })
  ];
  assert.deepEqual(nombres(list, 'momentum'), ['med', 'est']);
});

test("estrellas: ordena por total sin postergar estimados", () => {
  const list = [
    repo({ fullName: 'chico', stars: 10 }),
    repo({ fullName: 'grande', stars: 90000, isEstimated: true })
  ];
  assert.deepEqual(nombres(list, 'stars'), ['grande', 'chico']);
});

test("mas nuevos: menor edad primero", () => {
  const list = [repo({ fullName: 'viejo', ageInDays: 300 }), repo({ fullName: 'bebe', ageInDays: 2 })];
  assert.deepEqual(nombres(list, 'newest'), ['bebe', 'viejo']);
});

test("actividad: push mas reciente primero", () => {
  const list = [
    repo({ fullName: 'dormido', pushedAt: '2026-01-01T00:00:00Z' }),
    repo({ fullName: 'vivo',    pushedAt: '2026-08-27T00:00:00Z' })
  ];
  assert.deepEqual(nombres(list, 'active'), ['vivo', 'dormido']);
});

test("actividad: una fecha invalida no rompe el orden", () => {
  const list = [
    repo({ fullName: 'roto', pushedAt: undefined }),
    repo({ fullName: 'ok',   pushedAt: '2026-08-27T00:00:00Z' })
  ];
  assert.deepEqual(nombres(list, 'active'), ['ok', 'roto']);
});

test("forks: mas forks primero", () => {
  const list = [repo({ fullName: 'pocos', forks: 3 }), repo({ fullName: 'muchos', forks: 900 })];
  assert.deepEqual(nombres(list, 'forks'), ['muchos', 'pocos']);
});

test("campos ausentes o basura no rompen ningun criterio", () => {
  const list = [{ fullName: 'vacio' }, repo({ fullName: 'sano' }), { fullName: 'basura', stars: 'x', growthRate: null, forks: NaN }];
  for (const mode of Object.keys(SORTS)) {
    const out = sortRepos(list, mode);
    assert.equal(out.length, 3, mode);
    assert.ok(out.every(r => r && r.fullName), mode);
  }
});
