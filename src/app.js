const SORT_STORAGE_KEY = 'signalgit:sort';

let allRepos = [];
// Se resuelve en init(), una vez que sort.js ya publico SignalSort.
let sortMode = 'growth';
let filters = {
  mode: 'all', // all o gems
  lang: 'all',
  age: 'all',
  topic: null,
  query: ''
};

async function init() {
  try {
    const res = await fetch('./data/trending.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error("No data");
    const data = await res.json();
    allRepos = data.repositories;

    document.getElementById('last-update').textContent = `Actualizado: ${new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    sortMode = loadSortPreference();
    populateSorts();
    populateLanguages();
    populateTopics();
    setupEvents();
    render();
  } catch (err) {
    document.getElementById('repo-grid').innerHTML = `
      <div class="col-span-2 text-center py-12 text-red-400">
        No se encontraron datos. Las GitHub Actions deben correr al menos una vez.
      </div>
    `;
  }
}

function populateLanguages() {
  const langSelect = document.getElementById('lang-select');
  const languages = Array.from(new Set(allRepos.map(r => r.language).filter(Boolean))).sort();
  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    langSelect.appendChild(opt);
  });
}

function populateTopics() {
  const container = document.getElementById('topics-container');
  const topicCounts = {};

  allRepos.forEach(repo => {
    repo.topics.forEach(t => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  });

  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(entry => entry[0]);

  topTopics.forEach(topic => {
    const btn = document.createElement('button');
    btn.className = 'topic-btn px-2.5 py-1 rounded-full text-[10px] font-semibold bg-[#161b22] text-gray-400 border border-borderDark hover:text-white transition whitespace-nowrap';
    btn.textContent = `#${topic}`;
    btn.dataset.topic = topic;

    btn.addEventListener('click', () => {
      if (filters.topic === topic) {
        filters.topic = null;
        btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
      } else {
        document.querySelectorAll('.topic-btn').forEach(b => b.classList.remove('bg-blue-600', 'text-white', 'border-blue-500'));
        filters.topic = topic;
        btn.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
      }
      render();
    });
    container.appendChild(btn);
  });
}

function setupEvents() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.className = 'filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-transparent text-gray-300 border border-borderDark hover:bg-gray-800 transition';
      });
      e.target.className = 'filter-btn active px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white border border-blue-500 transition';
      filters.mode = e.target.dataset.filter;
      render();
    });
  });

  document.getElementById('lang-select').addEventListener('change', (e) => { filters.lang = e.target.value; render(); });
  document.getElementById('age-select').addEventListener('change', (e) => { filters.age = e.target.value; render(); });
  document.getElementById('search-input').addEventListener('input', (e) => { filters.query = e.target.value.toLowerCase(); render(); });
  document.getElementById('sort-select').addEventListener('change', (e) => {
    sortMode = e.target.value;
    e.target.title = SignalSort.SORTS[sortMode].hint;
    saveSortPreference(sortMode);
    render();
  });
}

// La preferencia es una comodidad por visitante; si el navegador bloquea el
// almacenamiento se sigue con el orden por defecto.
function loadSortPreference() {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved && SignalSort.SORTS[saved]) return saved;
  } catch (err) {
    // Navegador con almacenamiento bloqueado: se sigue con el orden por defecto.
    console.warn('No se pudo leer la preferencia de orden:', err.message);
  }
  return SignalSort.DEFAULT_SORT;
}

function saveSortPreference(mode) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, mode);
  } catch (err) {
    console.warn('No se pudo guardar la preferencia de orden:', err.message);
  }
}

function populateSorts() {
  const select = document.getElementById('sort-select');
  Object.entries(SignalSort.SORTS).forEach(([value, sort]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = sort.label;
    opt.title = sort.hint;
    select.appendChild(opt);
  });
  select.value = sortMode;
  select.title = SignalSort.SORTS[sortMode].hint;
}

// El feed son los 300 repos con mas senal de crecimiento, no el ranking global
// de GitHub. Ordenar por estrellas reordena ese conjunto, no lo amplia: se dice
// explicitamente para que el numero no se lea como algo que no es.
function updateScopeNote(mostrados) {
  const note = document.getElementById('scope-note');
  if (!note) return;
  const sort = SignalSort.SORTS[sortMode] || SignalSort.SORTS[SignalSort.DEFAULT_SORT];
  const universo = allRepos.length;
  const alcance = mostrados === universo
    ? `${universo} repositorios`
    : `${mostrados} de ${universo} repositorios`;
  note.textContent = `Mostrando ${alcance} del radar (los de mayor crecimiento detectado), ordenados por ${sort.label.toLowerCase()}. ${sort.hint}`;
}

// Los campos vienen de repositorios publicos: cualquiera controla su descripcion,
// nombre y topics. Se escapan antes de entrar al innerHTML de las tarjetas.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Solo se permiten enlaces http(s); cualquier otro esquema (javascript:, data:)
// se descarta y la tarjeta queda sin enlace en vez de ejecutar codigo.
function safeUrl(url) {
  try {
    const parsed = new URL(String(url), 'https://github.com');
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : '#';
  } catch {
    return '#';
  }
}

// El crecimiento se mide sobre la ventana disponible, que no siempre es de 24h.
// Se etiqueta con la ventana real en vez de afirmar "hoy" siempre.
function growthLabel(repo) {
  if (repo.isEstimated) return 'estimado';
  const h = repo.growthHours;
  if (h === null || h === undefined) return '';
  if (h >= 20 && h <= 28) return 'hoy';
  return `en ${h < 1 ? h.toFixed(1) : Math.round(h)}h`;
}

function growthTitle(repo) {
  if (repo.isEstimated) {
    return 'Sin medicion previa: estimado sobre la vida del repositorio. Se mide en la proxima actualizacion.';
  }
  const h = repo.growthHours;
  return `Estrellas ganadas en las ultimas ${h < 1 ? h.toFixed(1) : Math.round(h)}h`;
}

function growthClass(repo) {
  const base = 'font-mono text-[11px] px-1.5 py-0.5 rounded border';
  return repo.isEstimated
    ? `${base} text-amber-400 bg-amber-950/40 border-amber-900/50`
    : `${base} text-emerald-400 bg-emerald-950/40 border-emerald-900/50`;
}

function render() {
  const container = document.getElementById('repo-grid');

  let filtered = allRepos.filter(repo => {
    if (filters.mode === 'gems' && !repo.isGem) return false;
    if (filters.lang !== 'all' && repo.language !== filters.lang) return false;
    if (filters.age === 'new' && repo.ageInDays > 7) return false;
    if (filters.age === 'recent' && repo.ageInDays > 30) return false;
    if (filters.topic && !repo.topics.includes(filters.topic)) return false;

    if (filters.query) {
      // Sintaxis avanzada basica: si el usuario escribe stars:>1000
      if (filters.query.startsWith('stars:>')) {
        const num = parseInt(filters.query.split('>')[1]);
        if (!isNaN(num) && repo.stars <= num) return false;
      } else {
        const matchName = repo.fullName.toLowerCase().includes(filters.query);
        const matchDesc = repo.description.toLowerCase().includes(filters.query);
        if (!matchName && !matchDesc) return false;
      }
    }

    return true;
  });

  filtered = SignalSort.sortRepos(filtered, sortMode);
  updateScopeNote(filtered.length);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="col-span-2 text-center py-16 text-gray-500 text-sm">No hay repositorios que coincidan con esta busqueda.</div>';
    return;
  }

  container.innerHTML = filtered.map(repo => `
    <article class="bg-cardDark border border-borderDark rounded-xl p-5 flex flex-col justify-between hover:border-gray-500 transition shadow-sm">
      <div>
        <div class="flex items-start justify-between gap-2">
          <a href="${safeUrl(repo.url)}" target="_blank" rel="noopener noreferrer" class="text-blue-400 font-semibold text-base hover:underline break-all">
            ${esc(repo.fullName)}
          </a>
          ${repo.isGem ? `<span class="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">💎 Gema</span>` : ''}
        </div>
        <p class="text-gray-300 text-xs mt-2 line-clamp-2 leading-relaxed">
          ${esc(repo.description)}
        </p>

        ${repo.topics.length > 0 ? `
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${repo.topics.slice(0, 4).map(t => `<span class="text-[9px] text-gray-500 bg-bgDark px-1.5 py-0.5 rounded border border-borderDark">#${esc(t)}</span>`).join('')}
        </div>
        ` : ''}
      </div>

      <div class="mt-4 pt-3 border-t border-borderDark flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center gap-1 font-medium text-gray-300">
            ⭐ ${Number(repo.stars).toLocaleString()}
          </span>
          <span class="${growthClass(repo)}" title="${esc(growthTitle(repo))}">
            +${Number(repo.realDailyGrowth)} ${growthLabel(repo)}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class="bg-[#21262d] text-gray-300 px-2 py-0.5 rounded border border-borderDark text-[10px]">
            ${esc(repo.language)}
          </span>
          <span class="text-[10px] text-gray-500">
            ${Number(repo.ageInDays)}d
          </span>
        </div>
      </div>
    </article>
  `).join('');
}

init();
