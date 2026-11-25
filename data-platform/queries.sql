-- Volumes mensuels par nature et commune. Les lignes DVF d’une mutation
-- sont dédupliquées pour la commune demandée. Une mutation multicommunale peut
-- compter pour plusieurs communes, donc ne pas additionner les totaux communaux.
SELECT substr(m.date, 1, 7) AS month, m.nature, count(*) AS mutations
FROM mutation AS m
WHERE m.id IN (SELECT r.mutation_id FROM dvf_row AS r WHERE r.commune_code = ?1)
  AND m.date BETWEEN ?2 AND ?3
GROUP BY month, m.nature
ORDER BY month, m.nature;

-- Les chiffres du quartier sont des indicateurs agrégés IGN/INSEE 2022.
-- Un code BDNB actuel ne suffit pas pour valider le rattachement historique.
SELECT iris, median_income, poverty_rate, income_d9, interdecile_ratio
FROM filosofi
WHERE commune_code = ?1
ORDER BY iris;
