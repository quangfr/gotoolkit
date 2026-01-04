# Module Grid

`grid.html` expose un tableau multi-page piloté par AG Grid, conçu pour explorer des jeux de données et générer des exports prêts à partager.

## 1. Navigation & filtres
- Les données sont présentées avec des onglets, des filtres et la possibilité de trier/zoomer pour comparer rapidement des lignes ou mettre en valeur un sujet précis.
- Les comportements sont pensés pour les utilisateurs métier : chaque onglet peut représenter une perspective (projets, clients, idées) et les filtres sont persistants.

## 2. Templates métier
- Les templates sont gérés via `public/js/template-criteria.js`, ce qui permet de sauvegarder des critères (titre, synthèse, colonnes focus) et de les réappliquer rapidement.
- Le module propose aussi de compléter un template avec une synthèse automatique, facilitant la préparation d’un rapport ou d’un partage.

## 3. Export & qualité
- L’utilisateur peut exporter le tableau au format CSV ou JSON, avec un cache automatique (`?v=2025.12.29`) pour servir les assets statiques depuis `public/js`.
- Les comportements critiques sont couverts par des tests Playwright (`tests/grid-mock.spec.ts`), garantissant que la grille se charge correctement depuis `public/grid.html`.

## 4. Partage & historique
- Comme les autres modules, le module Grid s’appuie sur le worker de partage pour générer une URL (dans la collection `grids`) qui peut être diffusée à d’autres utilisateurs.
- L’historique stocke les exports et les versions partagées dans `localStorage`, permettant de retrouver une configuration ou un critère à posteriori.
