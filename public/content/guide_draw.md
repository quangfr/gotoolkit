# Module Draw

`draw.html` est la zone de dessin vecteur collaborative qui s’appuie sur Excalidraw via le pont `GoToolkitExcalidraw`.

## 1. L’interface Excalidraw
- Le launcher embarque Excalidraw avec un thème clair, des templates Mermaid et l’API exposée sur `window.GoToolkitExcalidraw`.
- Les utilisateurs peuvent dessiner des diagrammes, insérer des formes, et bénéficier de la conversion automatique de schémas Mermaid en éléments Excalidraw.

## 2. Templates métier
- Les gabarits proposés sont gérés dans `public/js/prompt.js` et `public/js/template-criteria.js` pour lancer immédiatement un diagramme d’architecture, de flow ou de carte mentale.
- Ces templates restent accessibles à tout moment et servent de point de départ à chaque nouveau dessin, ce qui accélère la création de visuels cohérents avec la charte GoToolkit.

## 3. Export & partage
- Les exports (PNG, SVG, JSON) restent compatibles avec le reste de la suite et peuvent être partagés via le worker avec la même logique de `canvas`, `grid` et `timeline`.

## 4. Partage et historique

- Le partage repose sur `GoToolkitShareWorker`, tout comme les autres modules : la version enregistrée comprend les métadonnées Excalidraw, ce qui permet de rouvrir un dessin exactement tel qu’il a été enregistré.
- Les drafts sont conservés dans IndexedDB (capsule-drafts) comme sur les autres modules, pour revenir sur un diagramme commencé sans le perdre.
