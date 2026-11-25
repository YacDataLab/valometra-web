// Bien décrit dans une demande (colonne `property_json`).
// Colonne `property_json` : un objet, ou {} si elle est absente ou corrompue.
export function parseProperty(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
