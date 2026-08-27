// Logica pura de calculo de crecimiento. Sin red ni disco, para poder testearla.

export const STATE_SIZE = 2000;   // repos que conservan historial entre corridas
export const FEED_SIZE = 300;     // repos que se publican para el frontend
export const HISTORY_MAX = 8;     // snapshots guardados por repo
export const HISTORY_TTL_H = 36;  // se descartan snapshots mas viejos que esto
export const TARGET_WINDOW_H = 24;
export const MIN_WINDOW_H = 1;    // ventana minima para considerar una medicion valida

const H = 60 * 60 * 1000;

// Elige el snapshot contra el cual medir: el mas cercano a 24h atras.
// Devuelve null si no hay ninguno con al menos MIN_WINDOW_H de antiguedad.
export function pickBaseline(history, nowMs) {
  if (!Array.isArray(history) || history.length === 0) return null;

  const usable = history
    .filter(h => h && typeof h.s === 'number' && typeof h.t === 'string')
    .map(h => ({ s: h.s, ms: Date.parse(h.t) }))
    .filter(h => Number.isFinite(h.ms) && (nowMs - h.ms) >= MIN_WINDOW_H * H);

  if (usable.length === 0) return null;

  // El mas cercano a la ventana objetivo de 24h
  let best = usable[0];
  let bestDist = Math.abs((nowMs - best.ms) / H - TARGET_WINDOW_H);
  for (const cand of usable.slice(1)) {
    const dist = Math.abs((nowMs - cand.ms) / H - TARGET_WINDOW_H);
    if (dist < bestDist) { best = cand; bestDist = dist; }
  }
  return { stars: best.s, ms: best.ms, hours: (nowMs - best.ms) / H };
}

// Calcula el crecimiento de un repo contra su historial previo.
export function computeGrowth({ stars, ageInDays, history, nowMs }) {
  const base = pickBaseline(history, nowMs);

  if (base) {
    const delta = Math.max(0, stars - base.stars);
    const hours = base.hours;
    return {
      growth: delta,
      growthHours: Math.round(hours * 10) / 10,
      // Tasa diaria normalizada: unica magnitud comparable entre ventanas distintas
      growthRate: (delta / hours) * 24,
      isEstimated: false
    };
  }

  // Sin historial utilizable: estimacion a partir de la vida del repo.
  const estimate = Math.max(0, Math.floor(stars / Math.max(1, ageInDays)));
  return {
    growth: estimate,
    growthHours: null,
    growthRate: estimate,
    isEstimated: true
  };
}

// Los medidos van SIEMPRE antes que los estimados: una estimacion sobre la vida
// entera del repo no es comparable con un delta de 24h y desplazaba al ranking.
export function compareRepos(a, b) {
  if (a.isEstimated !== b.isEstimated) return a.isEstimated ? 1 : -1;
  if (b.growthRate !== a.growthRate) return b.growthRate - a.growthRate;
  return b.stars - a.stars;
}

// Agrega el snapshot actual al historial, poda por antiguedad y por cantidad.
export function pushSnapshot(history, stars, nowIso) {
  const nowMs = Date.parse(nowIso);
  const prev = Array.isArray(history) ? history : [];
  return [...prev, { t: nowIso, s: stars }]
    .filter(h => h && Number.isFinite(Date.parse(h.t)) && (nowMs - Date.parse(h.t)) <= HISTORY_TTL_H * H)
    .sort((x, y) => Date.parse(x.t) - Date.parse(y.t))
    .slice(-HISTORY_MAX);
}
