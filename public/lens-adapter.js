'use strict';

(() => {
  const navigation = [...document.querySelectorAll('.site-header nav a')];
  const address = document.getElementById('address');

  function route() {
    const hash = location.hash.slice(1);
    const view = ['market', 'method'].includes(hash) ? hash : 'estimate';
    document.body.dataset.lensView = view;
    navigation.forEach(link => {
      if (link.hash === '#' + view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  document.getElementById('start-estimate').addEventListener('click', () => {
    if (address.disabled) {
      document.getElementById('estimate-form').scrollIntoView({ block: 'start' });
    } else {
      address.focus();
      address.scrollIntoView({ block: 'center' });
    }
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('valometra:estimated', () => {
    document.getElementById('result').scrollIntoView({ block: 'start' });
  });
  route();
})();
