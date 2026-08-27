import { Octokit } from "@octokit/rest";
import fs from "fs/promises";
import path from "path";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || ""
});

// IMPORTANTE: CAMBIAR POR LA URL REAL DE GITHUB PAGES UNA VEZ CREADO EL REPO
const LIVE_DATA_URL = "https://<TU-USUARIO>.github.io/<TU-REPO>/data/trending.json";

// Pausa para evitar abusar del Rate Limit de GitHub (30 requests/min en Search)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPreviousData() {
  const oldMap = new Map();
  try {
    console.log("Descargando estado anterior para calcular crecimiento real...");
    const res = await fetch(LIVE_DATA_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    data.repositories.forEach(repo => {
      oldMap.set(repo.id, repo);
    });
    console.log(`${oldMap.size} repositorios anteriores recuperados.`);
  } catch (error) {
    console.warn("No se pudo cargar el JSON anterior (Normal si es el primer despliegue o la URL no esta activa aun).");
  }
  return oldMap;
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
  const oldRepos = await fetchPreviousData();
  const rawRepos = await fetchCandidates();

  const processed = rawRepos
    .filter(repo => !isSpamOrList(repo))
    .map(repo => {
      const createdAt = new Date(repo.created_at);
      const now = new Date();
      const ageInDays = Math.max(1, Math.floor((now - createdAt) / (1000 * 60 * 60 * 24)));

      const currentStars = repo.stargazers_count;
      let realDailyGrowth = 0;

      // Calcular delta contra el dia anterior
      if (oldRepos.has(repo.id)) {
        const pastStars = oldRepos.get(repo.id).stars;
        realDailyGrowth = currentStars - pastStars;
      } else {
        // Estimacion si es nuevo en la base de datos
        realDailyGrowth = Math.floor(currentStars / ageInDays);
      }

      realDailyGrowth = Math.max(0, realDailyGrowth);

      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        description: repo.description || "Sin descripcion.",
        language: repo.language || "Multi/Other",
        stars: currentStars,
        realDailyGrowth: realDailyGrowth,
        forks: repo.forks_count,
        ageInDays,
        topics: repo.topics || [],
        isGem: currentStars < 1000 && realDailyGrowth > 20
      };
    })
    .sort((a, b) => b.realDailyGrowth - a.realDailyGrowth)
    .slice(0, 300); // Guardamos el Top 300

  const outputDir = path.resolve("src/data");
  await fs.mkdir(outputDir, { recursive: true });

  const payload = {
    updatedAt: new Date().toISOString(),
    total: processed.length,
    repositories: processed
  };

  await fs.writeFile(
    path.join(outputDir, "trending.json"),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  console.log(`Finalizado: ${processed.length} repositorios procesados y guardados.`);
}

run();
