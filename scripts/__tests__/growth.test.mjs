import test from "node:test";
import assert from "node:assert/strict";
import {
  pickBaseline, computeGrowth, compareRepos, pushSnapshot,
  HISTORY_MAX, HISTORY_TTL_H
} from "../growth.mjs";

const NOW = Date.parse("2026-08-28T12:00:00.000Z");
const hoursAgo = (h) => new Date(NOW - h * 3600e3).toISOString();

test("pickBaseline elige el snapshot mas cercano a 24h, no el mas viejo", () => {
  const history = [
    { t: hoursAgo(30), s: 100 },
    { t: hoursAgo(24), s: 150 },
    { t: hoursAgo(6),  s: 190 }
  ];
  const base = pickBaseline(history, NOW);
  assert.equal(base.stars, 150);
  assert.equal(Math.round(base.hours), 24);
});

test("pickBaseline ignora snapshots demasiado recientes", () => {
  assert.equal(pickBaseline([{ t: hoursAgo(0.2), s: 10 }], NOW), null);
});

test("pickBaseline devuelve null sin historial", () => {
  assert.equal(pickBaseline([], NOW), null);
  assert.equal(pickBaseline(undefined, NOW), null);
});

test("delta de 24h se reporta crudo y con su ventana", () => {
  const r = computeGrowth({
    stars: 200, ageInDays: 400,
    history: [{ t: hoursAgo(24), s: 150 }], nowMs: NOW
  });
  assert.equal(r.growth, 50);
  assert.equal(r.growthHours, 24);
  assert.equal(r.growthRate, 50);
  assert.equal(r.isEstimated, false);
});

test("ventana de 6h se normaliza a tasa diaria para poder ordenar", () => {
  const r = computeGrowth({
    stars: 120, ageInDays: 400,
    history: [{ t: hoursAgo(6), s: 100 }], nowMs: NOW
  });
  assert.equal(r.growth, 20);       // crudo: lo que se muestra
  assert.equal(r.growthHours, 6);
  assert.equal(r.growthRate, 80);   // 20 en 6h -> 80/dia, magnitud comparable
});

test("un repo sin historial queda marcado como estimado", () => {
  const r = computeGrowth({ stars: 1000, ageInDays: 10, history: [], nowMs: NOW });
  assert.equal(r.isEstimated, true);
  assert.equal(r.growth, 100);
  assert.equal(r.growthHours, null);
});

test("estrellas perdidas no producen crecimiento negativo", () => {
  const r = computeGrowth({
    stars: 90, ageInDays: 400,
    history: [{ t: hoursAgo(24), s: 100 }], nowMs: NOW
  });
  assert.equal(r.growth, 0);
});

test("REGRESION: un estimado enorme nunca desplaza a un medido", () => {
  const medido    = { isEstimated: false, growthRate: 5,     stars: 500 };
  const estimado  = { isEstimated: true,  growthRate: 14282, stars: 199949 };
  assert.deepEqual([estimado, medido].sort(compareRepos), [medido, estimado]);
});

test("entre medidos ordena por tasa diaria, no por delta crudo", () => {
  const seisHoras  = { isEstimated: false, growthRate: 80, stars: 1 }; // +20 en 6h
  const veinticuatro = { isEstimated: false, growthRate: 50, stars: 1 }; // +50 en 24h
  assert.deepEqual([veinticuatro, seisHoras].sort(compareRepos), [seisHoras, veinticuatro]);
});

test("pushSnapshot agrega, ordena y poda por antiguedad", () => {
  const history = [
    { t: hoursAgo(48), s: 1 },  // fuera de TTL
    { t: hoursAgo(10), s: 2 }
  ];
  const out = pushSnapshot(history, 3, new Date(NOW).toISOString());
  assert.equal(out.length, 2);
  assert.equal(out[0].s, 2);
  assert.equal(out[1].s, 3);
  assert.ok(out.every(h => (NOW - Date.parse(h.t)) <= HISTORY_TTL_H * 3600e3));
});

test("pushSnapshot respeta el tope de snapshots", () => {
  let history = [];
  for (let i = 20; i >= 0; i--) {
    history = pushSnapshot(history, 100 - i, hoursAgo(i));
  }
  assert.equal(history.length, HISTORY_MAX);
});

test("ciclo completo: primera corrida estima, la siguiente ya mide", () => {
  let history = [];
  const primera = computeGrowth({ stars: 100, ageInDays: 5, history, nowMs: NOW - 24 * 3600e3 });
  assert.equal(primera.isEstimated, true);

  history = pushSnapshot(history, 100, hoursAgo(24));
  const segunda = computeGrowth({ stars: 175, ageInDays: 6, history, nowMs: NOW });
  assert.equal(segunda.isEstimated, false);
  assert.equal(segunda.growth, 75);
  assert.equal(segunda.growthHours, 24);
});

// --- Preservacion de estado entre corridas ---

import { pruneHistory, mergeState, STATE_SIZE } from "../growth.mjs";

const nowIso = new Date(NOW).toISOString();

test("pruneHistory descarta snapshots caducados y conserva los vivos", () => {
  const out = pruneHistory([
    { t: hoursAgo(48), s: 1 },
    { t: hoursAgo(30), s: 2 },
    { t: hoursAgo(2),  s: 3 }
  ], nowIso);
  assert.deepEqual(out.map(h => h.s), [2, 3]);
});

test("REGRESION: un repo ausente de esta corrida conserva su historial", () => {
  const previous = new Map([
    [1, { stars: 100, history: [{ t: hoursAgo(6), s: 100 }] }],
    [2, { stars: 200, history: [{ t: hoursAgo(6), s: 200 }] }]
  ]);
  const seen = [{ id: 1, stars: 110, history: [{ t: hoursAgo(6), s: 100 }, { t: nowIso, s: 110 }] }];

  const merged = mergeState(previous, seen, nowIso);
  const ausente = merged.find(r => r.id === 2);

  assert.ok(ausente, "el repo ausente debe seguir en el estado");
  assert.equal(ausente.history.length, 1);
  assert.equal(merged.length, 2);
});

test("el ausente que vuelve ya se mide, no se estima", () => {
  const previous = new Map([[2, { stars: 200, history: [{ t: hoursAgo(24), s: 200 }] }]]);
  const merged = mergeState(previous, [], nowIso);
  const guardado = merged.find(r => r.id === 2);

  const r = computeGrowth({ stars: 260, ageInDays: 90, history: guardado.history, nowMs: NOW });
  assert.equal(r.isEstimated, false);
  assert.equal(r.growth, 60);
});

test("un ausente con historial caducado se deja ir", () => {
  const previous = new Map([[3, { stars: 50, history: [{ t: hoursAgo(48), s: 50 }] }]]);
  assert.equal(mergeState(previous, [], nowIso).length, 0);
});

test("los vistos tienen prioridad sobre los ausentes al recortar", () => {
  const seen = Array.from({ length: STATE_SIZE }, (_, i) => ({
    id: i, stars: 1, history: [{ t: nowIso, s: 1 }]
  }));
  const previous = new Map([[999999, { stars: 5, history: [{ t: hoursAgo(6), s: 5 }] }]]);

  const merged = mergeState(previous, seen, nowIso);
  assert.equal(merged.length, STATE_SIZE);
  assert.ok(!merged.some(r => r.id === 999999));
});

// --- Guardia contra sobreescribir el estado con un scrape fallido ---

import { assertEnoughCandidates, MIN_CANDIDATES } from "../growth.mjs";

test("un scrape vacio aborta en vez de pisar el estado", () => {
  assert.throws(() => assertEnoughCandidates(0), /Se aborta sin escribir/);
});

test("un scrape truncado por rate limit tambien aborta", () => {
  assert.throws(() => assertEnoughCandidates(MIN_CANDIDATES - 1), /minimo/);
});

test("un scrape sano sigue adelante", () => {
  assert.doesNotThrow(() => assertEnoughCandidates(MIN_CANDIDATES));
  assert.doesNotThrow(() => assertEnoughCandidates(1417));
});
