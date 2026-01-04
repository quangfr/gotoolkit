# Module Canvas

`canvas.html` est la zone “slides” de GoToolkit, pensée pour transformer des notes ou idées en livrables visuels (présentations, pitch decks, plans).

## 1. Création de modules visuels
- Les utilisateurs rassemblent des blocs (textes, images, formes) pour composer des slides, puis peuvent les réorganiser librement dans l’interface statique.
- Chaque page peut fonctionner de façon autonome : on peut ouvrir `canvas.html` directement, ajouter du contenu et générer une narration visuelle à partir de la même interface que celle qui pilote le reste de l’app.

## 2. Templates & prompts
- Les modèles disponibles (depuis `public/js/prompt.js`) fournissent des suggestions de structure et des prompts pour guider la création : pitch, rapport, plan stratégique, etc.
- Les templates s’appuient sur les filtres métier et les critères définis dans `public/js/template-criteria.js`, ce qui permet de lancer une présentation avec les données et la tonalité attendues.

## 3. Export & partage
- La page exporte les slides en PPTX, PNG et JSON, facilitant la diffusion sur un canal ou l’intégration dans un document plus large.
- Les partages utilisent le même moteur (`GoToolkitShareWorker`) qui alimente les autres modules, donc un canvas partagé reste fidèle à son état (images, textes, structure).
