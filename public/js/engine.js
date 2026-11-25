// Moteur d'estimation : Worker du navigateur qui exécute les modèles via Pyodide.
// Le moteur ne connaît ni la page ni le formulaire : il reçoit des variables et rend une promesse.
let worker,
  enginePromise,
  nextId = 0;
const pending = new Map();

function failPending(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

// Arrête le moteur et abandonne les calculs en cours ; le prochain appel le redémarre.
export function resetEngine() {
  worker?.terminate();
  worker = undefined;
  enginePromise = undefined;
  failPending(new Error('Le moteur a été arrêté.'));
}

// Démarre le moteur une seule fois (chargement de Pyodide et des modèles).
export function startEngine() {
  enginePromise ??= new Promise((resolve, reject) => {
    worker = new Worker('js/inference-worker.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') resolve();
      else if (data.id === undefined) {
        if (data.type === 'error') reject(new Error(data.message));
      } else if (data.type === 'prediction') {
        pending.get(data.id)?.resolve({ value: data.value, intervals: data.intervals });
        pending.delete(data.id);
      } else if (data.type === 'error') {
        pending.get(data.id)?.reject(new Error(data.message));
        pending.delete(data.id);
      }
    };
    worker.onerror = () => {
      const error = new Error('Le moteur n’a pas pu démarrer.');
      failPending(error);
      reject(error);
      resetEngine();
    };
    worker.postMessage({ type: 'init' });
  });
  return enginePromise;
}

// Estimation pour un jeu de variables : { value, intervals: { 50: [bas, haut], 80: [bas, haut] } }.
export async function predict(features) {
  await startEngine();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: 'predict', features, id });
  });
}
