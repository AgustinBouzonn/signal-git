import { Octokit } from "@octokit/rest";
import fs from "fs/promises";
import path from "path";
import {
  computeGrowth, compareRepos, pushSnapshot,
  STATE_SIZE, FEED_SIZE
} from "./growth.mjs";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || ""
});

const BASE_URL = "https://agustinbouzonn.github.io/signal-git";
// Estado liviano (id + estrellas + historial) que sobrevive entre corridas.
const STATE_URL = `${BASE_URL}/data/state.json`;
// Feed publicado en la corrida anterior; solo se usa como respaldo.
const FEED_URL = `${BASE_URL}/data/trending.json`;

// Pausa para evitar abusar del Rate Limit de GitHub (30 requests/min en Search)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Recupera el historial de estrellas de la corrida anterior.
// Se guarda aparte del feed porque el feed solo lleva el top y los repos que
// salian de el perdian su historial, volviendo a caer en la estimacion.
async function fetchPreviousState() {
  const stateMap = new Map();

  const load = async (url, label) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const list = data.repositories || [];
    list.forEach(repo => {
      if (repo && typeof repo.id === "number") {
        // El feed antiguo no trae historial: se sintetiza un snapshot con su
        // updatedAt para no desperdiciar la unica medicion disponible.
        const history = repo.history
          || (data.updatedAt ? [{ t: data.updatedAt, s: repo.stars }] : []);
        stateMap.set(repo.id, { stars: repo.stars, history });
      }
    });
    console.log(`${stateMap.size} repositorios recuperados desde ${label}.`);
  };

  console.log("Descargando estado anterior para calcular crecimiento real...");
  try {
    await load(STATE_URL, "state.json");
    return stateMap;
  } catch (error) {
    console.warn(`No se pudo cargar state.json (${error.message}). Probando con el feed anterior...`);
  }

  try {
    await load(FEED_URL, "trending.json");
  } catch (error) {
    console.warn("No hay estado previo disponible (normal en el primer despliegue).");
  }
  return stateMap;
}

function isSpamOrList(repo) {
  // 1. Filtrar repos vacios o muy ligeros (<100 KB) con muchas estrellas (Suelen ser Awesome Lists)
  if (repo.size < 100 && repo.stargazers_count > 500) return true;

  // 2. Filtrar si el lenguaje principal es puro texto
  const badLanguages = ['Markdown', 'Jupyter Notebook'];
  if (badLanguages.includes(repo.language)) return true;

  // 3. Filtro por palabras clave en el nombre
  const spamKeywords = ["awesome-", "interview", "roadmap", "books", "course", "tutorial"];
  const name = (repo.name || "").toLowerCase();

  return spamKeywords.some(kw => name.includes(kw));
}

async function fetchCandidates() {
  const date7DaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const date30DaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const queries = [
    `created:>${date7DaysAgo} stars:>10`,      // Recien nacidos explotando
    `created:>${date30DaysAgo} stars:>50`,     // Jovenes con traccion
    `pushed:>${date7DaysAgo} stars:100..5000`  // Repositorios activos de tamano medio
  ];

  let rawRepos = new Map();
  const pagesPerQuery = 5; // 5 paginas * 100 resultados = 500 por query maximo

  console.log("Iniciando scraping masivo en GitHub API...");

  for (const q of queries) {
    for (let page = 1; page <= pagesPerQuery; page++) {
      try {
        const res = await octokit.rest.search.repos({
          q: `${q} fork:false archived:false`,
          sort: "stars",
          order: "desc",
          per_page: 100,
          page: page
        });

        res.data.items.forEach(item => rawRepos.set(item.id, item));

        // Si hay menos de 100 resultados, se acabo esta query
        if (res.data.items.length < 100) break;

        // Delay anti-baneo
        await delay(2000);
      } catch (err) {
        console.warn(`Error en query [${q}] pagina ${page}:`, err.message);
        break;
      }
    }
  }

  return Array.from(rawRepos.values());
}

async function run() {
  const oldState = await fetchPreviousState();
  const rawRepos = await fetchCandidates();

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  const processed = rawRepos
    .filter(repo => !isSpamOrList(repo))
    .map(repo => {
      const createdAt = new Date(repo.created_at);
      const ageInDays = Math.max(1, Math.floor((nowMs - createdAt) / (1000 * 60 * 60 * 24)));
      const currentStars = repo.stargazers_count;

      const prev = oldState.get(repo.id);
      const { growth, growthHours, growthRate, isEstimated } = computeGrowth({
        stars: currentStars,
        ageInDays,
        history: prev?.history,
        nowMs
      });

      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description || "Sin descripcion.",
        language: repo.language || "Multi/Other",
        stars: currentStars,
        realDailyGrowth: growth,
        growthHours,        // horas reales de la ventana medida (null si es estimado)
        growthRate,         // tasa diaria normalizada, usada para ordenar
        isEstimated,
        forks: repo.forks_count,
        ageInDays,
        topics: repo.topics || [],
        isGem: currentStars < 1000 && growthRate > 20,
        history: pushSnapshot(prev?.history, currentStars, nowIso)
      };
    })
    .sort(compareRepos);

  const medidos = processed.filter(r => !r.isEstimated).length;
  console.log(`Candidatos: ${processed.length} | medidos: ${medidos} | estimados: ${processed.length - medidos}`);

  const outputDir = path.resolve("src/data");
  await fs.mkdir(outputDir, { recursive: true });

  // Estado: mas repos de los que se muestran, para no perder historial.
  const state = processed.slice(0, STATE_SIZE).map(r => ({
    id: r.id,
    stars: r.stars,
    history: r.history
  }));

  await fs.writeFile(
    path.join(outputDir, "state.json"),
    JSON.stringify({ updatedAt: nowIso, total: state.length, repositories: state }),
    "utf-8"
  );

  // Feed: solo lo que consume el frontend, sin el historial.
  const feed = processed.slice(0, FEED_SIZE).map(({ history, ...rest }) => rest);

  await fs.writeFile(
    path.join(outputDir, "trending.json"),
    JSON.stringify({ updatedAt: nowIso, total: feed.length, repositories: feed }, null, 2),
    "utf-8"
  );

  console.log(`Finalizado: ${feed.length} repositorios publicados, ${state.length} en estado.`);
}

run();
