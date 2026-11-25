'use strict';
// Thème clair/sombre : choix mémorisé dans ce navigateur, sinon réglage du système.
// Chargé sans `defer` dans <head> pour éviter un flash de thème au chargement.
(() => {
  const KEY = 'valometra-theme';
  const root = document.documentElement;
  const stored = () => {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'clair' || value === 'sombre' ? value : null;
    } catch {
      return null;
    }
  };
  const system = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair');
  const current = () => root.dataset.vmTheme;
  const apply = theme => {
    root.dataset.vmTheme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.querySelector('span').textContent = theme === 'sombre' ? 'Mode clair' : 'Mode sombre';
      button
        .querySelector('use')
        .setAttribute('href', theme === 'sombre' ? 'icons.svg#i-sun' : 'icons.svg#i-moon');
    }
  };
  apply(stored() ?? system());

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!stored()) apply(system());
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(current());
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const next = current() === 'sombre' ? 'clair' : 'sombre';
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* Le choix vaut pour cette visite seulement. */
      }
    });
  });
  // L'impression reste toujours en thème clair.
  let beforePrint = null;
  window.addEventListener('beforeprint', () => {
    beforePrint = current();
    root.dataset.vmTheme = 'clair';
  });
  window.addEventListener('afterprint', () => {
    if (beforePrint) apply(beforePrint);
    beforePrint = null;
  });
})();
