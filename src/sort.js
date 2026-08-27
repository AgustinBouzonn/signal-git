// Criterios de orden del feed.
// El archivo se carga como <script> clasico en el navegador y se importa desde
// los tests en Node; por eso publica en el objeto global en vez de exportar.
(function (root) {
  'use strict';

  // Piso para el momentum: sin el, un repo de 3 estrellas que gana 3 mas
  // dominaria el ranking entero por un movimiento sin significado.
  var MOMENTUM_FLOOR = 50;

  // Un estimado no es comparable con un valor medido, asi que en los ordenes
  // basados en crecimiento va siempre detras. En los que ordenan por un dato
  // duro (estrellas, edad, forks) la distincion no aplica.
  function medidosPrimero(a, b) {
    if (a.isEstimated === b.isEstimated) return 0;
    return a.isEstimated ? 1 : -1;
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  // Crecimiento relativo al tamano: destaca al repo chico que se mueve rapido
  // por encima del grande que suma mucho en terminos absolutos.
  function momentum(repo) {
    return num(repo.growthRate) / Math.max(num(repo.stars), MOMENTUM_FLOOR);
  }

  function tiempo(value) {
    var t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
  }

  var SORTS = {
    growth: {
      label: 'Crecimiento',
      hint: 'Estrellas ganadas por dia. Los valores estimados van al final.',
      compare: function (a, b) {
        return medidosPrimero(a, b)
          || num(b.growthRate) - num(a.growthRate)
          || num(b.stars) - num(a.stars);
      }
    },
    momentum: {
      label: 'Momentum',
      hint: 'Crecimiento en proporcion al tamano: repos chicos moviendose rapido.',
      compare: function (a, b) {
        return medidosPrimero(a, b)
          || momentum(b) - momentum(a)
          || num(b.growthRate) - num(a.growthRate);
      }
    },
    stars: {
      label: 'Estrellas',
      hint: 'Estrellas totales acumuladas.',
      compare: function (a, b) {
        return num(b.stars) - num(a.stars);
      }
    },
    newest: {
      label: 'Mas nuevos',
      hint: 'Repositorios creados hace menos tiempo.',
      compare: function (a, b) {
        return num(a.ageInDays) - num(b.ageInDays)
          || num(b.growthRate) - num(a.growthRate);
      }
    },
    active: {
      label: 'Actividad reciente',
      hint: 'Ultimo push al repositorio.',
      compare: function (a, b) {
        return tiempo(b.pushedAt) - tiempo(a.pushedAt)
          || num(b.growthRate) - num(a.growthRate);
      }
    },
    forks: {
      label: 'Mas forkeados',
      hint: 'Forks totales: senal de uso real, no solo de marcador.',
      compare: function (a, b) {
        return num(b.forks) - num(a.forks)
          || num(b.stars) - num(a.stars);
      }
    }
  };

  var DEFAULT_SORT = 'growth';

  // Ordena una copia: la lista original conserva el orden del feed.
  function sortRepos(repos, mode) {
    var sort = SORTS[mode] || SORTS[DEFAULT_SORT];
    return repos.slice().sort(sort.compare);
  }

  root.SignalSort = {
    SORTS: SORTS,
    DEFAULT_SORT: DEFAULT_SORT,
    sortRepos: sortRepos,
    momentum: momentum
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
