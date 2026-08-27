let allRepos = [];
let filters = {
  mode: 'all', // all o gems
  lang: 'all',
  age: 'all',
  topic: null,
  query: ''
};

async function init() {
  try {
    const res = await fetch('./data/trending.json');
    if (!res.ok) throw new Error("No data");
    const data = await res.json();
    allRepos = data.repositories;

    document.getElementById('last-update').textContent = `Actualizado: ${new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

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

  if (filtered.length === 0) {
    container.innerHTML = '<div class="col-span-2 text-center py-16 text-gray-500 text-sm">No hay repositorios que coincidan con esta busqueda.</div>';
    return;
  }

  container.innerHTML = filtered.map(repo => `
    <article class="bg-cardDark border border-borderDark rounded-xl p-5 flex flex-col justify-between hover:border-gray-500 transition shadow-sm">
      <div>
        <div class="flex items-start justify-between gap-2">
          <a href="${repo.url}" target="_blank" rel="noopener noreferrer" class="text-blue-400 font-semibold text-base hover:underline break-all">
            ${repo.fullName}
          </a>
          ${repo.isGem ? `<span class="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">💎 Gema</span>` : ''}
        </div>
        <p class="text-gray-300 text-xs mt-2 line-clamp-2 leading-relaxed">
          ${repo.description}
        </p>

        ${repo.topics.length > 0 ? `
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${repo.topics.slice(0, 4).map(t => `<span class="text-[9px] text-gray-500 bg-bgDark px-1.5 py-0.5 rounded border border-borderDark">#${t}</span>`).join('')}
        </div>
        ` : ''}
      </div>

      <div class="mt-4 pt-3 border-t border-borderDark flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center gap-1 font-medium text-gray-300">
            ⭐ ${repo.stars.toLocaleString()}
          </span>
          <span class="${growthClass(repo)}" title="${growthTitle(repo)}">
            +${repo.realDailyGrowth} ${growthLabel(repo)}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class="bg-[#21262d] text-gray-300 px-2 py-0.5 rounded border border-borderDark text-[10px]">
            ${repo.language}
          </span>
          <span class="text-[10px] text-gray-500">
            ${repo.ageInDays}d
          </span>
        </div>
      </div>
    </article>
  `).join('');
}

init();
