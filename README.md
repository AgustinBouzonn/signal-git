# SignalGit

Radar de repositorios de GitHub que están creciendo de verdad, antes de que se vuelvan mainstream.

**→ [agustinbouzonn.github.io/signal-git](https://agustinbouzonn.github.io/signal-git/)**

Coste cero: sin base de datos, sin servidor y sin mantenimiento. GitHub Actions hace el scraping cada 6 horas y publica un sitio estático en GitHub Pages.

## Cómo mide el crecimiento

La métrica es *estrellas ganadas*, no *estrellas totales*: un repo con 200.000 estrellas que suma 3 por día no es una señal, y uno con 800 que suma 200 sí lo es.

Como no hay base de datos, el estado vive en el propio sitio publicado. Cada corrida descarga el JSON de la corrida anterior desde GitHub Pages, lo compara con lo que ve ahora y vuelve a publicarlo. El historial es el sitio.

Tres decisiones sostienen que ese número sea honesto:

- **El estado está separado de lo que se muestra.** `data/state.json` guarda 2.000 repos con su historial de estrellas; `data/trending.json` publica solo el top 300 que consume el frontend. Si el estado se guardara junto con el feed, un repo que sale del top perdería su historia y al reaparecer volvería a contarse como nuevo.
- **El historial lleva timestamps.** El delta se mide contra el snapshot más cercano a 24 h atrás, así "hoy" significa 24 h aunque el cron corra cada 6 horas.
- **Los medidos van antes que los estimados.** Un repo sin historial previo solo puede estimarse (`estrellas / días de vida`), y esa estimación es mucho mayor que un delta real de 24 h. Si ambos compitieran en el mismo orden, el ranking premiaría "repo nuevo en la base" en vez de "repo creciendo". Los estimados se marcan en ámbar y quedan detrás de cualquier repo medido.

Un repo aparece como `estimado` en su primera aparición y pasa a medido en la corrida siguiente.

## Estructura

```
scripts/growth.mjs          Lógica de crecimiento (pura, sin red ni disco)
scripts/fetch-trending.mjs  Scraping, filtrado anti-spam y escritura de los JSON
scripts/__tests__/          Tests de la lógica, corren en CI antes del scrape
src/                        Frontend: HTML + Vanilla JS + Tailwind precompilado
src/data/                   Generado por el workflow, no versionado
```

## Desarrollo local

```bash
npm install
npm test
GITHUB_TOKEN=$(gh auth token) npm run fetch
npm run dev
```

El token no es obligatorio, pero sin él la Search API corta por rate limit a mitad del scrape.

## Filtros anti-ruido

Se descartan forks, archivados, repos de menos de 100 KB con más de 500 estrellas (suelen ser listas), los que tienen Markdown o Jupyter Notebook como lenguaje principal, y los que llevan `awesome-`, `interview`, `roadmap`, `books`, `course` o `tutorial` en el nombre.

## Notas de operación

- Si el scrape devuelve menos de 100 candidatos se asume que la API falló: el proceso aborta sin escribir, para no pisar el estado bueno. El workflow falla y el sitio anterior queda intacto.
- Los campos que vienen de repositorios públicos (descripción, nombre, topics) los controla cualquiera, así que se escapan antes de renderizarse y solo se aceptan enlaces `http(s)`.
- El cron corre a las 00:00, 06:00, 12:00 y 18:00 UTC. También hay ejecución manual desde la pestaña Actions.
