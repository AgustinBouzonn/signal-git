<div align="center">

# 📡 SignalGit

**Radar de repositorios de GitHub que están creciendo de verdad, antes de que se vuelvan mainstream.**

[![Deploy](https://img.shields.io/github/actions/workflow/status/AgustinBouzonn/signal-git/update-and-deploy.yml?style=flat-square&label=deploy&logo=githubactions&logoColor=white)](https://github.com/AgustinBouzonn/signal-git/actions/workflows/update-and-deploy.yml)
[![Demo](https://img.shields.io/badge/demo-en_vivo-7aa2f7?style=flat-square&logo=githubpages&logoColor=white)](https://agustinbouzonn.github.io/signal-git/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](package.json)
[![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](src/app.js)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=flat-square&logo=tailwindcss&logoColor=white)](tailwind.config.js)

**[Abrir SignalGit →](https://agustinbouzonn.github.io/signal-git/)**

</div>

SignalGit tiene costo cero: sin base de datos, sin servidor y sin mantenimiento. GitHub Actions hace el scraping cada 6 horas y publica un sitio estático en GitHub Pages.

## Características

- 📈 **Estrellas ganadas, no totales:** mide el crecimiento de las últimas 24 horas.
- 🔀 **Seis criterios de orden** que se aplican en el navegador, sin volver a pedir datos.
- 💎 **Modo gemas:** filtra repos de menos de 1.000 estrellas que ganan más de 20 por día.
- 🧹 **Filtros anti-ruido** que descartan listas, cursos, forks y repos archivados.
- 🛡️ **Estado protegido:** si el scrape falla, el sitio anterior queda intacto.

## Cómo mide el crecimiento

La métrica es *estrellas ganadas*, no *estrellas totales*: un repo con 200.000 estrellas que suma 3 por día no es una señal, y uno con 800 que suma 200 sí lo es.

Como no hay base de datos, el estado vive en el propio sitio publicado. Cada corrida descarga el JSON de la corrida anterior desde GitHub Pages, lo compara con lo que ve ahora y vuelve a publicarlo. El historial es el sitio.

Tres decisiones sostienen que ese número sea honesto:

- **El estado está separado de lo que se muestra.** `data/state.json` guarda 2.000 repos con su historial de estrellas; `data/trending.json` publica solo el top 300 que consume el frontend. Si el estado se guardara junto con el feed, un repo que sale del top perdería su historia y al reaparecer volvería a contarse como nuevo.
- **El historial lleva timestamps.** El delta se mide contra el snapshot más cercano a 24 h atrás, así "hoy" significa 24 h aunque el cron corra cada 6 horas.
- **Los medidos van antes que los estimados.** Un repo sin historial previo solo puede estimarse (`estrellas / días de vida`), y esa estimación es mucho mayor que un delta real de 24 h. Si ambos compitieran en el mismo orden, el ranking premiaría "repo nuevo en la base" en vez de "repo creciendo". Los estimados se marcan en ámbar y quedan detrás de cualquier repo medido.

Un repo aparece como `estimado` en su primera aparición y pasa a medido en la corrida siguiente.

## Ranking y filtros

### Formas de ordenar

El selector reordena el feed sin volver a pedir datos. Seis criterios:

| Criterio | Qué destaca |
|---|---|
| **Crecimiento** (por defecto) | Estrellas ganadas por día. |
| **Momentum** | Crecimiento en proporción al tamaño: el repo de 800 estrellas que suma 120 por encima del de 200.000 que suma 300. |
| **Estrellas** | Total acumulado, el criterio clásico. |
| **Más nuevos** | Menor antigüedad. |
| **Actividad reciente** | Último push al repositorio. |
| **Más forkeados** | Forks totales, señal de uso real y no solo de marcador. |

Dos detalles que hacen que los números no engañen:

- **El conjunto no cambia, solo su orden.** El feed son los 300 repos con más señal de crecimiento, no el ranking global de GitHub. Ordenar por estrellas reordena ese conjunto; no trae los repos más estrellados del mundo. La nota bajo los filtros lo dice en la propia interfaz.
- **En los criterios de crecimiento, los estimados van al final** por la misma razón que en el ranking del backend. En los que ordenan por un dato duro (estrellas, edad, forks) la distinción no aplica y no se usa.

Momentum aplica un piso de 50 estrellas al divisor: sin él, un repo de 3 estrellas que gana 3 dominaría el listado por un movimiento sin significado.

El criterio elegido se recuerda en el navegador de cada visitante.

### Filtros anti-ruido

Se descartan forks, archivados, repos de menos de 100 KB con más de 500 estrellas (suelen ser listas), los que tienen Markdown o Jupyter Notebook como lenguaje principal, y los que llevan `awesome-`, `interview`, `roadmap`, `books`, `course` o `tutorial` en el nombre.

## Inicio rápido

Requiere Node.js 20, la misma versión que usa el workflow.

```bash
npm install
npm test
GITHUB_TOKEN=$(gh auth token) npm run fetch
npm run dev
```

El token no es obligatorio, pero sin él la Search API corta por rate limit a mitad del scrape.

| Script | Qué hace |
|---|---|
| `npm run fetch` | Scrapea GitHub y escribe `src/data/state.json` y `src/data/trending.json` |
| `npm test` | Corre los tests de crecimiento, orden y versionado de assets |
| `npm run build:css` | Compila Tailwind minificado en `src/output.css` |
| `npm run stamp` | Agrega `?v=<hash>` a los assets de `src/index.html` |
| `npm run dev` | Compila CSS, versiona assets y sirve `src/` en local |

`npm run dev` reescribe los hashes de `src/index.html`. Si cambian solo por tu build local, no hace falta commitearlos: el workflow los regenera al publicar.

## Estructura del proyecto

```
scripts/growth.mjs          Lógica de crecimiento (pura, sin red ni disco)
src/sort.js                 Criterios de orden del feed (compartido con los tests)
scripts/stamp-assets.mjs    Versiona los assets con el hash de su contenido
scripts/fetch-trending.mjs  Scraping, filtrado anti-spam y escritura de los JSON
scripts/__tests__/          Tests de la lógica, corren en CI antes del scrape
src/                        Frontend: HTML + Vanilla JS + Tailwind precompilado
src/data/                   Generado por el workflow, no versionado
```

## Notas de operación

- Si el scrape devuelve menos de 100 candidatos se asume que la API falló: el proceso aborta sin escribir, para no pisar el estado bueno. El workflow falla y el sitio anterior queda intacto.
- Los campos que vienen de repositorios públicos (descripción, nombre, topics) los controla cualquiera, así que se escapan antes de renderizarse y solo se aceptan enlaces `http(s)`.
- GitHub Pages sirve todo con `Cache-Control: max-age=600`, `index.html` incluido. Sin versionar los assets, un visitante puede quedarse diez minutos con el HTML nuevo y el `app.js` viejo en caché, y ver controles que ese JS no sabe manejar. Por eso el workflow corre `npm run stamp`, que les agrega `?v=<hash del contenido>` antes de publicar.
- El feed se pide con `cache: 'no-cache'` para que los datos se revaliden en cada carga en vez de quedar hasta diez minutos atrasados.
- El cron corre a las 00:00, 06:00, 12:00 y 18:00 UTC. También hay ejecución manual desde la pestaña Actions.
