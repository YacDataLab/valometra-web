'use strict';
// Éléments communs à toutes les pages : lien d'évitement et accès à l'espace privé.
(() => {
  // Le lien d'évitement ne passe pas par l'ancre : un #contenu changerait la vue de la page d'accueil.
  document.getElementById('skip-link')?.addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('contenu')?.focus();
  });
  fetch('/api/session')
    .then(response => response.json())
    .then(session => {
      if (session.admin) document.getElementById('admin-link').hidden = false;
    })
    .catch(() => {});
})();
