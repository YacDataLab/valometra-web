// Export CSV des demandes pour le gestionnaire.
import { parseProperty } from './property.mjs';

const HEADER = [
  'Date',
  'Nom',
  'Email',
  'Téléphone',
  'Profil',
  'Horizon',
  'Statut',
  'Adresse',
  'Surface',
  'Estimation indicative',
  'Message',
  'Notes',
  'Consentement',
];

// Cellule entre guillemets ; une valeur qui ressemble à une formule est neutralisée.
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s﻿]*[=+\-@]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function leadsCsv(leads) {
  const rows = [
    HEADER,
    ...leads.map(lead => {
      const property = parseProperty(lead.property_json);
      return [
        lead.created_at,
        lead.name,
        lead.email,
        lead.phone,
        lead.role,
        lead.timeline,
        lead.status,
        property.address,
        property.surface,
        property.point,
        lead.message,
        lead.notes,
        lead.consent_at,
      ];
    }),
  ];
  return '﻿' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}

export const csvResponse = body =>
  new Response(body, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': 'attachment; filename="valometra-demandes.csv"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
