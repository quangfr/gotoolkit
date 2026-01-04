# Module Timeline

`timeline.html` propose une frise chronologique visuelle, idéale pour raconter un projet ou un historique.

## 1. Construction de la frise
- Les données peuvent être ajoutées manuellement, importées, ou générées à partir des documents partagés. Chaque événement peut contenir un titre, une durée, des images et des métadonnées.
- Le rendu repose sur `vis-timeline` pour placer les événements sur une ligne temporelle, avec zoom, navigation et aide à l’alignement des plages.

## 2. Export & partage
- La frise peut être exportée vers XLSX, PNG ou JSON ; l’utilisateur choisit le format qui lui convient pour intégrer ou diffuser la timeline.
- Un lien de partage est généré via `GoToolkitShareWorker` sur `https://share.gotoolkit.workers.dev`, permettant de diffuser la frise complète ou la consulter dans d’autres contextes.

## 3. Intégration au reste de l’expérience
- Initialement accessible depuis la page d’accueil, la timeline garde les mêmes balises de cache `?v=2025.12.29` que les autres modules pour rester alignée avec le reste de l’application.
- Les exports s’inscrivent dans la même logique que les autres modules (Canvas, Draw, Grid) : les données restent hors ligne tant que l’utilisateur ne partage pas explicitement.
