# Safran AE — SCORE (Produit Contract Data)

## ��� Résumé exécutif

---

- Client : Safran Aircraft Engines
- Produit : SCORE (référentiel contrats MRO)
- Contexte : Vision floue, perçue comme simple formulaire
- Défi : Créer un vrai produit data transverse
- Action : CPO + PDA, prototypage, modélisation data
- Résultat : Produit structurant, interopérable, adopté

---

### ��� Contexte & Enjeux

- Multiplicité des contrats MRO
- Formats hétérogènes
- Données dispersées
- Risque de dépendance aux interprétations individuelles
- Enjeu de fiabilité pour la facturation et le pilotage

---

### ⚠️ Problèmes à résoudre

- Confusion “formulaire vs produit”
- Absence de modèle data partagé
- Faible exploitabilité transverse
- Manque de données réelles validées
- Faible interopérabilité initiale

---

### ��� Intervention GO-LIVE!

### Rôles assurés

- Consultant Product Owner
- Product & Data Assistant

### Méthodes

- Ateliers de cadrage produit
- Prototypage rapide
- Modélisation objets métier
- Campagnes de validation data
- Design event-driven

### Outils

- Prototype HTML/CSS
- Templates contractuels
- Outils data internes
- Dashboards

### Rituels

- Ateliers métiers
- Revues de prototype
- Validations contractuelles
- Comités produit

---

### ��� Résultats & Impact

- Vision produit partagée
- Backlog structuré
- Modèle data robuste
- Données validées terrain
- Interconnexion facturation
- Forte adoption métier

---

### ��� Feedback client

> “Première fois qu’un projet contractuel est mené avec autant de méthode et de clarté.”
> 
> 
> — Franck, référent métier SCORE
> 

---

### ��� Apprentissages

✅ Le prototype accélère l’alignement

✅ La donnée est un produit en soi

✅ CPO + PDA = effet levier fort

⚠️ Nécessité d’outiller tôt la gouvernance data

---

### ♻️ Réplicabilité

Applicable pour :

- Produits data métiers
- Environnements industriels
- Systèmes contractuels
- SI interconnectés

---

### ��� Version marketing

> GO-LIVE! a transformé SCORE d’un simple formulaire en un véritable produit data stratégique pour Safran.
> 
> 
> En combinant vision produit, modélisation métier et ancrage terrain, l’équipe a créé un référentiel fiable, interopérable et adopté.
> 

---

### ��� Pièces jointes

- Prototype
- Dictionnaire data
- Extraits contrats
- Dashboards

---

# Safran AE — MAESTRO (SAP IBP / BTP)

---

## ��� Résumé exécutif

- **Client** : Safran Aircraft Engines
- **Programme** : MAESTRO / IBP — transformation de la planification MRO réseau (Demand / Induction / MPS / RTI / Integration)
- **Contexte** : programme international, multi-stream, déploiement progressif par vagues, forte dépendance à l’adoption et à la qualité des données
- **Défi** : orchestrer un mastodonte sans perdre le terrain (workshops, change, training, roll-out) **et** matérialiser certains parcours métier pour aligner équipes / intégrateur
- **Action GO-LIVE!** : PMO & Change structurant + initiatives “Proxy PO” (journey, objets, règles) + prototypage frugal (HTML/IA) + communication & communauté ambassadeurs
- **Résultat** : trajectoire sécurisée, adoption outillée, convergence métier–IT accélérée, capitalisation GO-LIVE renforcée

---

## ��� Contexte & Enjeux

MAESTRO vise à industrialiser la planification MRO à l’échelle du réseau mondial.

Le programme est :

- **multi-tracks** (Demand / Induction / Road to Induction / Master Data / Network & Shop planning / Integration),
- **multi-sites** (déploiement progressif, internal puis offload),
- rythmé par des **sprints**, des phases de **training**, **go-live**, **hypercare**,
- et fortement dépendant de la **conduite du changement** (adoption, key users, communication).

En pratique, la difficulté n’est pas seulement technique :

��� c’est d’**aligner des acteurs nombreux** (métiers, intégrateur, sites, management), et de rendre la trajectoire **compréhensible et appropriable**.

---

## ⚠️ Problèmes à résoudre

- Complexité de synchronisation entre streams (dépendances / jalons / design vs build vs test).
- Risque de “programme opaque” : difficile de rendre tangible le progrès pour les parties prenantes.
- Adoption : besoin d’un dispositif vivant (communication, ambassadeurs, formation) et pas seulement d’un plan.
- Certaines chaînes métier clés (ex : **Induction Plan → Induction Request**) nécessitent une **clarification fonctionnelle** pour fluidifier l’alignement métier–IT–intégrateur.

---

## ��� Intervention GO-LIVE! (mission de Livier)

### ��� Rôles

- **PMO / Stream Leader Change Management** (cœur de mission)
- **Proxy Product Owner (par périmètre)** — sur certaines séquences métier
- **GO-LIVE! Explorer** (prototypage frugal, contenus, activation)

---

## ��� MOMENT GO-LIVE! #1 — Orchestration d’un programme multi-stream

Livier contribue à structurer et sécuriser la mise en musique du programme :

- préparation / organisation des **workshops** et des points de suivi,
- coordination des acteurs (équipes internes, intégrateur, relais sites),
- contribution aux supports de **kick-off**, de **roadmap** et de **reporting**,
- maintien d’une trajectoire lisible malgré la simultanéité des tracks.

��� Objectif : éviter l’effet “mille sujets en parallèle” et garder un pilotage exploitable.

---

## ��� MOMENT GO-LIVE! #2 — Change Management vivant (pas PowerPoint)

Au-delà de la gouvernance, l’enjeu est l’adoption.

Actions menées :

- animation / structuration d’une **communauté d’ambassadeurs**,
- production de contenus de communication interne (posts, synthèses d’avancement, status reports),
- contribution à des formats plus engageants (storytelling, métaphores, vidéo à venir),
- encadrement / animation d’un mini-collectif (dont alternants) autour d’événements et de dynamique projet.

��� Objectif : rendre le programme **vivant**, lisible, et “appropriable” par le terrain.

---

## ��� MOMENT GO-LIVE! #3 — Proxy PO : matérialiser un parcours métier clé

Livier identifie un périmètre fonctionnel “simple et utile” pour sortir du flou :

### **Journey : Induction Plan → Induction Request**

Articulation de plusieurs KDD (IP.1 / IP.2 / IP.3 / IP.8 / IP.9), avec :

- horizons de planification (ex : 3–18 mois / 3–6 mois / 0–3 mois),
- règles métier (probabilités, transformations d’état),
- objets métier (ESN, types moteurs/modules, workscopes, shops préférentiels),
- points d’intervention humaine (planner adjustments).

��� Objectif : aligner métier/IT/intégrateur sur une séquence concrète et à fort impact opérationnel.

---

## ��� MOMENT GO-LIVE! #4 — GO-LIVE! move : prototypage frugal pour “aider l’intégrateur”

Dans un programme mastodonte, Livier déclenche une démarche d’exploration pragmatique :

- prototypage rapide (HTML, exemples fictifs, itérations IA),
- focalisation sur la **structure des écrans**, les données en entrée/sortie,
- recherche de valeur : soutenir l’alignement et accélérer la clarification, sans attendre un cycle complet.

��� Objectif : **rendre tangible** un parcours, tester un langage, débloquer des échanges.

---

## ��� Résultats & Impact (observables)

- Trajectoire mieux sécurisée : coordination / workshops / rythmes maîtrisés.
- Adoption renforcée : communication régulière, ambassadeurs, dynamique de communauté.
- Convergence métier–IT–intégrateur améliorée sur des périmètres concrets via cadrage journey.
- Capacité GO-LIVE! accrue : capitalisation (GO Roadmap / synthèses) et diffusion de pratiques (prototypage, storytelling).

*(À compléter si tu veux avec 2–3 métriques “soft” : nombre d’ateliers, nombre de posts/status reports, taille communauté ambassadeurs, etc.)*

---

## ��� Apprentissages

✅ Dans un programme multi-stream, la valeur vient autant de l’**orchestration** que du delivery.

✅ L’adoption se travaille comme un produit : rythme, contenus, communauté.

✅ Le prototypage frugal est un levier énorme pour rendre visibles des chaînes métier abstraites.

✅ Un PMO peut devenir “PMO augmenté” en prenant des **périmètres Proxy PO** bien choisis.

---

## ♻️ Réplicabilité

Applicable à :

- programmes SAP / IBP / transformation supply chain,
- déploiements multi-sites / roll-out par vagues,
- contextes où la conduite du changement est un facteur critique de succès,
- organisations nécessitant un pont métier–IT–intégrateur.

---

## ��� Annexes / preuves (à lier dans Notion)

- Plan projet multi-mois (tracks / sprints / go-live / hypercare)
- Roll-out shop planning (vagues)
- GO Roadmap MAESTRO (NOW/NEXT/LATER)
- Lien prototype (HTML) + repo (si autorisé en interne)
- Exemples de posts / status report / supports ambassadeurs

---

## ��� Version marketing (1 paragraphe)

GO-LIVE! a contribué à sécuriser la trajectoire du programme MAESTRO en combinant orchestration PMO, conduite du changement active et initiatives Proxy PO. En matérialisant un parcours métier clé via un prototypage frugal et une communication vivante (ambassadeurs, contenus, reporting), l’équipe a renforcé l’alignement métier–IT–intégrateur et l’appropriation du programme par le terrain.

---

# Safran AE - WALK & WKS COCKPIT

## ��� Résumé exécutif

- Client : Safran Aircraft Engines
- Produit : WALK (outil transactionnel d’élaboration des workscopes)
- Contexte : Système robuste mais opaque
- Défi : Rendre la donnée exploitable et améliorer durablement les pratiques
- Action : Structuration métier + PDA + vitrine web + boucles d’apprentissage
- Résultat : Outil lisible, adopté et devenu levier de progrès collectif

---

## ��� Contexte & Enjeux — Un moteur puissant… sans tableau de bord

Safran Aircraft Engines ha développé WALK pour structurer les workscopes et tracer les interactions entre les différents acteurs :

- client,
- technico-commerciaux,
- équipes en shop,
- management.

Sur le plan technique, l’outil est solide, fiable, performant.

Mais dans les usages quotidiens, un malaise s’installe rapidement.

- La donnée est enfermée dans le système.
- Les utilisateurs ne disposent pas de vision globale.
- Les analyses sont complexes et réservées à quelques experts.
- Les équipes peinent à percevoir la valeur de leurs efforts.

��� WALK fonctionne, mais reste une **boîte noire transactionnelle** :

on alimente le système, sans réellement pouvoir exploiter ce qu’il produit.

---

## ⚠️ Problèmes à résoudre — Quand un bon outil devient un frein

Plusieurs dérives apparaissent :

- Multiplication de fichiers Excel parallèles
- Reconstitution manuelle des indicateurs
- Frustration métier croissante
- Hétérogénéité des pratiques de workscoping
- Difficulté à capitaliser sur l’expérience passée

Risque majeur :

��� Disposer d’un système industriel robuste… mais structurellement sous-exploité.

---

## ��� Intervention GO-LIVE!

### Rôles mobilisés

- Consultant Product Owner
- Product & Data Assistant

Objectif : transformer WALK d’un outil transactionnel fermé en un écosystème lisible, apprenant et pilotable.

---

## ��� MOMENT GO-LIVE! #1 — Donner un langage commun au système

Avant de rendre WALK visible, il fallait d’abord le rendre compréhensible.

GO-LIVE! engage un travail de fond sur :

- les objets métiers,
- leurs attributs,
- leurs relations,
- leurs usages opérationnels,
- leurs indicateurs.

Ce chantier aboutit à :

- un dictionnaire métier partagé,
- une documentation vivante,
- une base commune d’interprétation.

��� WALK cesse progressivement d’être un outil “technique” pour devenir un système métier partagé.

---

## ��� MOMENT GO-LIVE! #2 — Sécuriser la donnée par le terrain

La fiabilité de la donnée devient un enjeu central.

GO-LIVE! positionne un Product & Data Assistant pour :

- reprendre l’historique,
- consolider les sources,
- recouper les informations,
- valider avec les bons interlocuteurs.

Le PDA devient le garant opérationnel de la cohérence.

Effets directs :

- production de rapports fiables,
- conception de dashboards pertinents,
- création de supports pédagogiques,
- montée en compétence progressive des équipes.

��� La donnée cesse d’être “supposée juste”. Elle devient vérifiée.

---

## ��� MOMENT GO-LIVE! #3 — Oser ouvrir le capot : créer une vitrine indépendante

Malgré les progrès, un constat persiste :

Même structurée, la donnée reste difficilement accessible dans WALK.

GO-LIVE! prend alors une initiative structurante, non prévue initialement :

��� Créer une vitrine externe dédiée.

Une interface web moderne, responsive, développée en HTML/CSS, indépendante du cœur applicatif.

Objectifs :

- exposer la richesse réelle du système,
- guider les usages,
- rendre la donnée intelligible,
- faciliter la navigation.

C’est la naissance du **Workscope Cockpit**.

---

## ���️ Le Workscope Cockpit — Du moteur au tableau de bord

Le Cockpit devient le point d’entrée naturel des utilisateurs.

Il permet de :

- comprendre la logique globale des workscopes,
- accéder aux bons rapports,
- contextualiser les indicateurs,
- intégrer tutoriels et guides,
- rechercher l’information efficacement.

��� WALK reste le moteur.

��� Le Cockpit devient le tableau de bord.

---

## ��� MOMENT GO-LIVE! #4 — Installer l’amélioration continue des pratiques

Une fois la donnée visible et partagée, un nouveau potentiel émerge.

Pour la première fois, Safran peut analyser ses propres pratiques de workscoping.

GO-LIVE! met en place des boucles d’apprentissage impliquant :

- clients,
- technico-commerciaux,
- équipes opérationnelles,
- management.

Concrètement :

- analyse comparative des workscopes,
- identification des écarts,
- mise en lumière des meilleures pratiques,
- capitalisation collective,
- ajustement progressif des méthodes.

��� WALK devient un outil d’apprentissage organisationnel, pas seulement de production.

---

## ��� Résultats & Impact — Un système qui crée désormais de la valeur

- Déverrouillage du système
- Lecture transverse facilitée
- Usage massif des données
- Réduction des Excel parallèles
- Adoption renforcée
- Harmonisation progressive des pratiques
- Montée en maturité collective

Le Cockpit devient à la fois :

��� un outil opérationnel

��� un outil de pilotage

��� un outil de progrès continu.

---

## ��� Feedback utilisateur

> “Avant, WALK était une boîte noire.
> 
> 
> Avec le Cockpit, on comprend enfin ce qu’on produit, et on sait comment progresser.”
> 

---

## ��� Apprentissages GO-LIVE!

✅ Un système performant peut échouer sans lisibilité

✅ La donnée devient stratégique quand elle est partagée

✅ L’UX est un levier d’alignement organisationnel

✅ Le PDA accélère la maturité collective

✅ La visibilité crée l’amélioration continue

---

## ♻️ Réplicabilité

Ce modèle est applicable à :

- ERP industriels
- outils transactionnels
- plateformes métiers complexes
- systèmes data fermés

---

## ��� Version marketing

> GO-LIVE! a transformé WALK d’une boîte noire transactionnelle en un système lisible, adopté et apprenant.
> 
> 
> En créant une vitrine web indépendante et en installant des boucles d’amélioration continue, l’équipe a ouvert le capot d’un outil industriel robuste et fait progresser durablement les pratiques.
> 

---

## ��� Version courte — Pitch / Site

### Cas client — Safran AE / WALK

WALK était un système robuste, mais opaque.

GO-LIVE! l’a structuré, ouvert et outillé pour en faire un levier d’amélioration continue.

Résultat : une plateforme enfin lisible, adoptée et créatrice de valeur collective.

---

# Safran AE — ADVance (Billing Companion)

## Case Study — “MÊME PAS PEUR”:  Oser “l’émergence produit” comme réponse à des enjeux de ramp-up industriel

---

## ��� Résumé exécutif

- **Client** : Safran Aircraft Engines
- **Contexte** : ramp-up industriel du moteur LEAP
- **Cadre initial** : programme transverse de transformation MRO (facturation / contrats / opérations / SI)
- **Mandat formel** : appui programme, coordination et structuration

- **Défi réel** : retrouver un fil rouge produit dans un ensemble de projets dispersés
- **Action GO-LIVE!** : prototypage frugal, animation stratégique, construction d’une vision cible
- **Résultat** : émergence d’ADVance comme solution cœur, portée par les sponsors

---

## ��� Contexte & Enjeux — LEAP et fragmentation

Avec la montée en puissance du moteur LEAP, Safran doit absorber :

- une hausse massive des shop visits,
- une complexité contractuelle accrue,
- une pression forte sur la facturation.

Pour répondre à ces enjeux, plusieurs chantiers sont lancés :

- outils,
- flux,
- process,
- interfaces,
- règles.

Mais ces projets avancent **en silos**.

Il n’existe pas encore de vision unifiée.

��� Un programme riche… mais sans colonne vertébrale.

---

## ⚠️ Problème central

Quand GO-LIVE! intervient, le vrai problème n’est pas technique.

C’est un problème de **sens et de cohérence** :

- Où va-t-on vraiment ?
- Quel est l’objet central ?
- Comment tout s’articule ?
- Quel outil porte la transformation ?

Chaque projet est “utile”.

Mais personne ne voit encore le système.

Risque majeur :

��� Investir beaucoup… sans transformer durablement.

---

## ��� Positionnement GO-LIVE!

### ��� Rôle réel

- Facilitateur stratégique du programme
- Animateur de vision produit émergente
- Catalyst d’alignement sponsors / métiers / IT

Pas de mandat “Product Owner”.

Mais une mission plus délicate :

��� Faire émerger un produit là où il n’y a qu’un programme.

---

## ��� MOMENT GO-LIVE! #1 — Retrouver le fil rouge

Première action : écouter, cartographier, relier.

GO-LIVE! analyse :

- les chantiers en cours,
- les irritants terrain,
- les dépendances,
- les doublons,
- les angles morts.

Puis pose une question simple :

> “Quel est l’objet qui relie tout ça ?”
> 

Peu à peu, une évidence se dessine :

��� Le dossier de facturation est le point de convergence.

---

## ��� MOMENT GO-LIVE! #2 — Prototyper un “outil idéal”

Plutôt que débattre abstraitement, GO-LIVE! choisit :

��� Montrer.

Par prototypage frugal (HTML, maquettes, scénarios), est matérialisé :

- un espace de travail central,
- un backlog métier,
- des statuts,
- des pièces,
- des décisions,
- des alertes.

Ce n’est pas “le futur outil”.

C’est un **objet de discussion**.

Un révélateur.

---

## ��� MOMENT GO-LIVE! #3 — Provoquer les bonnes discussions

Les prototypes deviennent un support stratégique.

Ils permettent de :

- sortir des débats théoriques,
- confronter les visions,
- révéler les priorités,
- arbitrer collectivement.

Sponsors, métiers et IT commencent à parler du **même objet**.

��� La vision converge.

---

## ��� MOMENT GO-LIVE! #4 — Faire émerger l’option “solution à façon”

À mesure que les échanges mûrissent, un constat s’impose :

Aucun outil existant ne peut jouer ce rôle central.

GO-LIVE! formule alors une proposition structurante :

��� Créer une solution dédiée, pensée pour le métier.

Non comme “un projet de plus”.

Mais comme :

### ��� La locomotive du programme.

Le produit qui :

- porte la transformation,
- structure les flux,
- absorbe la complexité,
- rend le système pilotable.

---

## ��� MOMENT GO-LIVE! #5 — Embarquer les sponsors

Cette proposition n’est pas imposée.

Elle est construite par :

- démonstration,
- itérations,
- preuves,
- alignement progressif.

Les sponsors reconnaissent :

- la cohérence,
- la valeur,
- la robustesse.

��� Ils portent la décision.

ADVance est lancé.

---

## ��� Résultats & Impact

- Passage d’un programme fragmenté à une trajectoire lisible
- Émergence d’un produit cœur partagé
- Alignement renforcé sponsors / métiers / IT
- Accélération des décisions structurantes
- Base solide pour l’industrialisation LEAP

ADVance devient le pivot du système.

---

## ��� Apprentissages

✅ Un programme sans produit reste fragile

✅ Le prototypage est un outil politique sain

✅ Montrer vaut mieux qu’expliquer

✅ L’alignement se construit par l’objet

✅ La vision se fabrique collectivement

---

## ♻️ Réplicabilité

Applicable à :

- grands programmes de transformation,
- contextes multi-projets,
- environnements industriels complexes,
- situations sans sponsor produit clair.

---

## ��� Version marketing

Dans un contexte de ramp-up LEAP, GO-LIVE! a aidé Safran à faire émerger un produit structurant au cœur d’un programme fragmenté.

Par le prototypage frugal et l’animation stratégique, le compagnon ADVance est devenu la locomotive de la transformation.

---

# Epiconcept — MSF SIRH & Homere Connect

**��� Résumé exécutif**

- Client : Epiconcept (BU ONG)
- Produits : Homere / Homere Connect
- Contexte : Phase de transition organisationnelle et produit
- Défi : Assurer la continuité tout en préparant l’avenir
- Action : Pilotage transverse, stabilisation, structuration, accompagnement
- Résultat : Service sécurisé, transformation enclenchée, forte satisfaction

**��� Contexte & Enjeux — Un moment charnière pour l’éditeur**

Epiconcept est un éditeur spécialisé, reconnu dans le monde humanitaire.

En 2025, la BU ONG traverse une phase stratégique :

- maintien d’un produit historique robuste,
- conception d’une future plateforme SaaS,
- évolution des méthodes de travail,
- croissance du périmètre client.

Dans ce contexte, une responsable clé s’absente temporairement pour congé maternité.

Son rôle est central, transversal, structurant.

��� L’enjeu n’est pas de “remplacer une personne”,

mais de sécuriser un écosystème.

**⚠️ Problèmes à résoudre — Continuer sans fragiliser**

Plusieurs risques apparaissent :

- perte de continuité décisionnelle,
- surcharge des équipes,
- dilution des priorités,
- fragilisation du delivery,
- tension sur les engagements clients.

Notamment :

- SLA MSF critique,
- roadmap Homere à tenir,
- lancement Homere Connect à préparer.

��� Tout devait continuer… sans rupture.

**��� Intervention GO-LIVE!**

**Rôle**

- Chef de projet / Product Owner transverse

Objectif : garantir la stabilité tout en préparant la transformation.

**��� MOMENT GO-LIVE! #1 — Reprendre le fil sans casser la dynamique**

Dès l’arrivée, GO-LIVE! se concentre sur :

- la compréhension fine du contexte,
- la récupération du savoir implicite,
- l’alignement avec la direction BU,
- la sécurisation des interlocuteurs clients.

Résultat :

��� confiance maintenue, continuité assurée.

**��� MOMENT GO-LIVE! #2 — Stabiliser l’opérationnel sous pression**

Le périmètre est large :

- gouvernance MSF,
- gestion des RFC,
- coordination multi-clients,
- pilotage du run,
- support applicatif.

GO-LIVE! structure :

- les rituels,
- les priorités,
- les circuits de décision,
- le reporting.

��� Le système tient, même en forte charge.

**��� MOMENT GO-LIVE! #3 — Préparer l’avenir en parallèle**

En parallèle du run, un chantier stratégique est mené :

��� Homere Connect.

GO-LIVE! contribue à :

- installer Scrum,
- structurer le backlog,
- planifier les jalons,
- gérer les dépendances.

Sans ralentir l’existant.

��� Double piste maîtrisée : présent + futur.

**��� MOMENT GO-LIVE! #4 — Étendre la contribution au-delà du périmètre**

Face aux besoins, GO-LIVE! s’implique aussi sur :

- avant-vente,
- devis,
- arbitrages produit,
- organisation interne.

Objectif :

��� renforcer la capacité globale de la BU.

**��� Résultats & Impact — Une transition réussie**

- SLA MSF sécurisé
- Clients rassurés
- Organisation stabilisée
- MVP Homere Connect maintenu
- Gouvernance consolidée
- Climat de confiance renforcé

Mission reconnue comme l’une des plus marquantes.

**��� Feedback client**

“NPS 10/10.”

**��� Apprentissages GO-LIVE!**

✅ Sécuriser une transition est un travail produit

✅ Le relationnel est un actif stratégique

✅ Stabiliser permet d’innover

✅ La transformation se pilote dans la continuité

**♻️ Réplicabilité**

Applicable pour :

- PME éditeurs
- phases de transition
- départs temporaires
- transformation produit
- contextes multi-clients

**��� Version marketing**

GO-LIVE! a accompagné Epiconcept dans une phase charnière de son évolution, en sécurisant l’existant tout en préparant le passage au SaaS.

Une transition critique menée sans rupture, saluée par un NPS de 10/10.

**��� Version courte — Pitch**

Chez Epiconcept, GO-LIVE! a sécurisé une transition clé dans un contexte de transformation produit.

Continuité, confiance, avenir préparé.
