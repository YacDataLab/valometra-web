'use strict';
(() => {
  const { esc, money: euros, frDateTime, byId: $ } = window.ValometraFormat,
    money = n => (Number.isFinite(n) ? euros(n) : 'Non calculée');
  const states = {
      nouveau: 'Nouveau',
      a_contacter: 'À contacter',
      contacte: 'Contacté',
      rendez_vous: 'Rendez-vous',
      termine: 'Terminé',
    },
    times = {
      moins_3_mois: 'Moins de 3 mois',
      '3_6_mois': '3 à 6 mois',
      plus_6_mois: 'Plus de 6 mois',
      a_definir: 'À définir',
    },
    roles = { proprietaire: 'Propriétaire', acquereur: 'Acquéreur', autre: 'Autre situation' };
  let offset = 0,
    timer,
    version = 0;
  const params = () =>
    new URLSearchParams({
      q: $('admin-search').value,
      status: $('admin-status').value,
      offset: String(offset),
    });
  async function load() {
    const token = ++version;
    $('admin-message').textContent = 'Chargement…';
    try {
      const r = await fetch('/api/admin/leads?' + params());
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Accès impossible.');
      if (token !== version) return;
      $('admin-export').href = '/api/admin/leads/export?' + params();
      $('admin-message').textContent =
        `${data.total} demande${data.total > 1 ? 's' : ''} correspondant aux filtres`;
      $('admin-pagination').textContent =
        `Page ${Math.floor(offset / 30) + 1} / ${Math.max(1, Math.ceil(data.total / 30))}`;
      $('admin-prev').disabled = offset === 0;
      $('admin-next').disabled = offset + 30 >= data.total;
      $('admin-list').innerHTML =
        data.rows
          .map(row => {
            const p = row.property;
            return `<article class="lead-card"><div class="section-head"><div><h2>${esc(row.name)}</h2><span class="hint">${esc(frDateTime(row.createdAt))} · ${esc(roles[row.role])} · ${esc(times[row.timeline])}</span></div><span class="pill">${esc(states[row.status])}</span></div><div class="lead-contact"><span>${esc(row.email || 'E-mail non renseigné')}</span><span>${esc(row.phone || 'Téléphone non renseigné')}</span></div><p><b>${esc(p.address || 'Adresse non précisée')}</b></p><p class="hint">${p.surface ? esc(p.surface) + ' m² · ' : ''}${p.rooms ? esc(p.rooms) + ' pièces · ' : ''}Estimation indicative jointe : ${money(p.point)}</p><p class="lead-message">${esc(row.message || 'Aucun message complémentaire.')}</p><details><summary>Suivi et consentement</summary><p class="hint">Demande de contact confirmée le ${esc(frDateTime(row.consentAt))} · version ${esc(row.consentVersion)}</p><label>Statut<select id="status-${row.id}">${Object.entries(
              states,
            )
              .map(
                ([key, value]) =>
                  `<option value="${key}" ${key === row.status ? 'selected' : ''}>${value}</option>`,
              )
              .join(
                '',
              )}</select></label><label>Notes privées<textarea id="notes-${row.id}" rows="3" maxlength="4000">${esc(row.notes)}</textarea></label><div class="actions"><button class="secondary" data-save="${row.id}">Enregistrer le suivi</button><button class="secondary" data-delete="${row.id}">Supprimer la demande</button></div><p id="feedback-${row.id}" role="status" class="hint"></p></details></article>`;
          })
          .join('') || '<p>Aucune demande pour le moment.</p>';
    } catch (e) {
      $('admin-message').textContent = e.message;
    }
  }
  $('admin-search').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      offset = 0;
      load();
    }, 300);
  });
  $('admin-status').addEventListener('change', () => {
    offset = 0;
    load();
  });
  $('admin-refresh').onclick = load;
  $('admin-prev').onclick = () => {
    offset = Math.max(0, offset - 30);
    load();
  };
  $('admin-next').onclick = () => {
    offset += 30;
    load();
  };
  $('admin-list').addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.save || button.dataset.delete;
    if (!id) return;
    const deleting = Boolean(button.dataset.delete);
    if (deleting && !confirm('Supprimer définitivement cette demande et ses coordonnées ?')) return;
    button.disabled = true;
    try {
      const r = await fetch('/api/admin/leads/' + id, {
        method: deleting ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: deleting
          ? undefined
          : JSON.stringify({ status: $('status-' + id).value, notes: $('notes-' + id).value }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (deleting) await load();
      else $('feedback-' + id).textContent = 'Suivi enregistré.';
    } catch (e) {
      $('feedback-' + id).textContent = e.message;
    } finally {
      button.disabled = false;
    }
  });
  async function loadFeedback() {
    const box = $('feedback-body');
    try {
      const r = await fetch('/api/admin/feedback');
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
      if (!total) {
        box.textContent = 'Aucun retour pour le moment.';
        return;
      }
      const label = { trop_bas: 'Trop basse', juste: 'Juste', trop_haut: 'Trop haute' };
      box.innerHTML =
        '<div class="stats">' +
        Object.keys(label)
          .map(k => `<div class="stat"><b>${data.counts[k] ?? 0}</b><span>${label[k]}</span></div>`)
          .join('') +
        '</div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Avis</th><th>Commune</th><th>Surface</th><th>Pièces</th><th>Estimé</th><th>Prix réel</th></tr></thead><tbody>' +
        data.rows
          .map(
            r =>
              `<tr><td>${esc(r.created_at.slice(0, 10))}</td><td>${label[r.verdict]}</td><td>${esc(r.town_code)}</td><td>${r.surface} m²</td><td>${r.rooms}</td><td>${money(r.estimate)}</td><td>${r.actual ? money(r.actual) : '—'}</td></tr>`,
          )
          .join('') +
        '</tbody></table></div>';
    } catch (e) {
      box.textContent = e.message || 'Retours indisponibles.';
    }
  }
  loadFeedback();
  load();
})();
