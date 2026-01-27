(function (global) {
    const promptCategories = {
        strategie: { label: "STRATEGIE", icon: "target" },
        discovery: { label: "DISCOVERY", icon: "compass" },
        organisation: { label: "ORGANISATION", icon: "users" },
        metrics: { label: "METRIQUES", icon: "bar-chart-3" },
        delivery: { label: "DELIVERY", icon: "rocket" },
        tech: { label: "TECH", icon: "cpu" },
        design: { label: "DESIGN", icon: "palette" },
        data: { label: "DATA", icon: "database" },
        ia: { label: "IA", icon: "sparkles" }
    };

    const promptShortcuts = [
        // STRATEGIE (9)
        {
            id: "strat-cadrage-produit",
            title: "Cadrage produit",
            category: "strategie",
            content: "Aide-moi à cadrer l'initiative [lancement CRM]. Donne: Contexte, Problème, Objectif, Hypothèses clés, KPI principaux, Hors périmètre, Risques, Questions ouvertes."
        },
        {
            id: "strat-vision-succes",
            title: "Définition du succès",
            category: "strategie",
            content: "Définis ce que signifie le succès pour [refonte checkout]. Propose: North Star Metric, 3 KPI secondaires, garde-fous, horizon temporel."
        },
        {
            id: "strat-positionnement",
            title: "Positionnement",
            category: "strategie",
            content: "Propose un positionnement clair pour [offre freemium] (problème, cible, promesse, différenciation, alternatives)."
        },
        {
            id: "strat-roadmap-now-next-later",
            title: "Roadmap Now/Next/Later",
            category: "strategie",
            content: "Crée une roadmap Now/Next/Later pour [portail partenaires]. Pour chaque item: objectif, livrable, dépendances, risque, métrique de validation."
        },
        {
            id: "strat-rollout",
            title: "Stratégie de rollout",
            category: "strategie",
            content: "Propose une stratégie de rollout progressive pour [déploiement Europe]: cohortes, critères d'éligibilité, observabilité, plan de rollback."
        },
        {
            id: "strat-priorisation",
            title: "Priorisation",
            category: "strategie",
            content: "Priorise [backlog Q2] avec une grille Impact/Effort (ou RICE). Donne le classement, les hypothèses et les incertitudes."
        },
        {
            id: "strat-business-case",
            title: "Business case",
            category: "strategie",
            content: "Construis un business case pour [business case]: valeur attendue, coûts, risques, ROI, et scénario pessimiste/réaliste/optimiste."
        },
        {
            id: "strat-parties-prenantes",
            title: "Parties prenantes",
            category: "strategie",
            content: "Cartographie les parties prenantes de [alignement comex]: objectifs, attentes, influence, et plan d'alignement."
        },
        {
            id: "strat-objectifs-okrs",
            title: "OKR",
            category: "strategie",
            content: "Propose des OKR pour [OKR trimestre]: 1 objectif clair et 3 résultats clés mesurables."
        },

        // DISCOVERY (9)
        {
            id: "disc-story-map",
            title: "Story mapping",
            category: "discovery",
            content: "Construis une story map pour [inscription en ligne]. Donne: activités haut niveau, tâches, variations, MVP et V1."
        },
        {
            id: "disc-personas",
            title: "Personas",
            category: "discovery",
            content: "Définis 2-3 personas pour [prospection B2B] avec objectifs, frustrations, contexte d'usage."
        },
        {
            id: "disc-jtbd",
            title: "Jobs To Be Done",
            category: "discovery",
            content: "Formule les JTBD pour [support premium] (quand..., je veux..., afin de...)."
        },
        {
            id: "disc-parcours-ux",
            title: "Parcours UX",
            category: "discovery",
            content: "Décris le parcours UX de [parcours commande]: étapes, points de friction, microcopie, états vides, erreurs."
        },
        {
            id: "disc-copy-ux",
            title: "Microcopy",
            category: "discovery",
            content: "Propose la microcopy pour [écran facture]: titres, CTA, messages d'erreur, feedback succès."
        },
        {
            id: "disc-hypotheses",
            title: "Hypothèses à valider",
            category: "discovery",
            content: "Liste les hypothèses critiques de [hypothèse prix] et comment les valider rapidement."
        },
        {
            id: "disc-pain-points",
            title: "Pain points",
            category: "discovery",
            content: "Identifie les pain points principaux autour de [abandons panier] et leur impact utilisateur."
        },
        {
            id: "disc-opportunites",
            title: "Opportunités",
            category: "discovery",
            content: "Décris 5 opportunités produit autour de [idéation features] avec valeur et effort estimés."
        },
        {
            id: "disc-interviews",
            title: "Guide d'entretien",
            category: "discovery",
            content: "Prépare un guide d'entretien utilisateur pour [entretiens clients]: objectifs, questions, signaux à observer."
        },

        // ORGANISATION (9)
        {
            id: "org-compte-rendu",
            title: "CR de réunion",
            category: "organisation",
            content: "Rédige un compte rendu pour [réunion produit] avec retranscription et partage d'écran: décisions, actions, points ouverts, risques, prochaines étapes."
        },
        {
            id: "org-plan-action",
            title: "Plan d'action",
            category: "organisation",
            content: "Établis un plan d'action pour [plan action]: action, owner, échéance, dépendances, critères de succès."
        },
        {
            id: "org-raci",
            title: "RACI",
            category: "organisation",
            content: "Crée un RACI pour [RACI programme] avec rôles et responsabilités."
        },
        {
            id: "org-support-ops",
            title: "Support & Ops",
            category: "organisation",
            content: "Prépare le support pour [runbook incident]: runbook, FAQ, escalade, métriques support."
        },
        {
            id: "org-communication",
            title: "Plan de communication",
            category: "organisation",
            content: "Propose un plan de communication pour [annonce release]: audiences, messages, canaux, calendrier, feedback attendu."
        },
        {
            id: "org-rituels",
            title: "Rituels d'équipe",
            category: "organisation",
            content: "Définis les rituels pour [rituels squad]: cadence, objectifs, participants, livrables."
        },
        {
            id: "org-transcription",
            title: "Retranscription vocale",
            category: "organisation",
            content: "Transforme [atelier roadmap] (audio + partage d'écran) en transcription structurée: points clés, décisions, actions, questions."
        },
        {
            id: "org-ocr-notes",
            title: "OCR notes",
            category: "organisation",
            content: "Analyse une image [photo tableau] et extrait les notes puis structure en décisions, actions, risques."
        },
        {
            id: "org-ocr-process",
            title: "OCR processus",
            category: "organisation",
            content: "À partir d'une capture d'écran [screenshot backlog], détecte le texte et propose un résumé opérationnel exploitable."
        },

        // METRIQUES (9)
        {
            id: "met-plan-experiment",
            title: "Plan d'expérimentation",
            category: "metrics",
            content: "Propose un plan d'expérimentation pour [A/B test]: hypothèse, métrique primaire, population, durée, critères d'arrêt."
        },
        {
            id: "met-instrumentation",
            title: "Plan d'instrumentation",
            category: "metrics",
            content: "Définis un plan d'instrumentation pour [tracking événements]: événements, propriétés, funnels, dashboards, alertes."
        },
        {
            id: "met-kpi-dashboard",
            title: "Dashboard KPI",
            category: "metrics",
            content: "Conçois un dashboard KPI pour [dashboard exec]: 5-7 tuiles, définitions exactes, fréquence, source de vérité."
        },
        {
            id: "met-risques",
            title: "Analyse des risques",
            category: "metrics",
            content: "Liste les risques de [risques projet] (produit, technique, data, légal, sécurité). Pour chacun: probabilité, impact, mitigation."
        },
        {
            id: "met-securite-privacy",
            title: "Sécurité & privacy",
            category: "metrics",
            content: "Identifie les enjeux sécurité/privacy de [données sensibles] et propose des garde-fous mesurables."
        },
        {
            id: "met-qualite",
            title: "Qualité & SLA",
            category: "metrics",
            content: "Définis les métriques de qualité pour [SLA support]: SLA/SLO, seuils d'alerte, plan de monitoring."
        },
        {
            id: "met-funnel",
            title: "Funnel",
            category: "metrics",
            content: "Construis un funnel pour [funnel activation] avec étapes, conversion attendue, points de drop-off."
        },
        {
            id: "met-cohortes",
            title: "Cohortes",
            category: "metrics",
            content: "Propose une analyse de cohortes pour [cohortes nouveaux]: segmentation, métriques suivies, lecture business."
        },
        {
            id: "met-alertes",
            title: "Alertes",
            category: "metrics",
            content: "Définis les alertes clés pour [alertes churn]: signaux faibles, seuils, réponse opérationnelle."
        },

        // DELIVERY (9)
        {
            id: "del-user-story",
            title: "User story + AC",
            category: "delivery",
            content: "Écris une user story pour [user story] et des critères d'acceptation en Gherkin."
        },
        {
            id: "del-spec-fonctionnelle",
            title: "Spec fonctionnelle",
            category: "delivery",
            content: "Rédige une spec fonctionnelle pour [spécif commande]: objectif, scope, user flows, règles métier, erreurs, permissions."
        },
        {
            id: "del-plan-delivery",
            title: "Plan de delivery",
            category: "delivery",
            content: "Décompose la livraison de [plan delivery]: phases, jalons, dépendances, critères de passage."
        },
        {
            id: "del-release-checklist",
            title: "Checklist release",
            category: "delivery",
            content: "Crée une checklist de release pour [release v1]: feature flags, migration, monitoring, rollback, doc interne."
        },
        {
            id: "del-qa",
            title: "Plan de test",
            category: "delivery",
            content: "Propose un plan de test pour [test régression]: cas nominaux, cas limites, non-régression."
        },
        {
            id: "del-acceptance",
            title: "Critères de passage",
            category: "delivery",
            content: "Définis les critères de passage pour [critères go]: qualité, perf, UX, data, support."
        },
        {
            id: "del-rollout",
            title: "Plan de déploiement",
            category: "delivery",
            content: "Propose un plan de déploiement pour [déploiement canary]: étapes, rollback, communication, monitoring."
        },
        {
            id: "del-formation",
            title: "Formation",
            category: "delivery",
            content: "Prépare la formation pour [formation interne]: audiences, supports, objectifs, évaluation."
        },
        {
            id: "del-documentation",
            title: "Documentation",
            category: "delivery",
            content: "Structure la documentation de [doc utilisateur]: guide utilisateur, FAQ, procédures, glossaire."
        },

        // TECH (9)
        {
            id: "tech-contrat-api",
            title: "Contrat API",
            category: "tech",
            content: "Propose un contrat API pour [API paiement]: endpoints, payloads, erreurs, pagination, exemples."
        },
        {
            id: "tech-schema-donnees",
            title: "Modèle de données",
            category: "tech",
            content: "Conçois un modèle de données pour [schéma commandes]: entités, champs, relations, contraintes, index."
        },
        {
            id: "tech-tradeoffs",
            title: "Trade-offs",
            category: "tech",
            content: "Compare 2-3 options d'implémentation pour [option SSO] avec impacts coût, perf, maintenance."
        },
        {
            id: "tech-dette",
            title: "Dette technique",
            category: "tech",
            content: "Évalue la dette technique liée à [dette historique] et propose un plan de réduction."
        },
        {
            id: "tech-qualite-data",
            title: "Qualité des données",
            category: "tech",
            content: "Définis des contrôles de qualité data pour [qualité leads]: validations, anomalies, seuils."
        },
        {
            id: "tech-archi",
            title: "Architecture",
            category: "tech",
            content: "Décris l'architecture cible pour [architecture cible]: composants, flux, dépendances, contraintes."
        },
        {
            id: "tech-perf",
            title: "Performance",
            category: "tech",
            content: "Propose un plan d'amélioration perf pour [perf mobile]: goulots, métriques, actions."
        },
        {
            id: "tech-observability",
            title: "Observabilité",
            category: "tech",
            content: "Définis la stratégie d'observabilité pour [observabilité API]: logs, métriques, traces, dashboards."
        },
        {
            id: "tech-securite",
            title: "Sécurité applicative",
            category: "tech",
            content: "Identifie les points de sécurité pour [sécurité sessions] et les contrôles à mettre en place."
        },

        // DESIGN (9)
        {
            id: "design-flowchart-process",
            title: "Flowchart processus",
            category: "design",
            content: "Génère un flowchart Mermaid pour [flux validation] avec étapes et décisions (oui/non)."
        },
        {
            id: "design-flowchart-system",
            title: "Flowchart système",
            category: "design",
            content: "Crée un flowchart Mermaid pour le flux système de [flux data] (sources, traitements, sorties)."
        },
        {
            id: "design-flowchart-user",
            title: "Flowchart parcours",
            category: "design",
            content: "Écris un flowchart Mermaid du parcours utilisateur pour [parcours SAV]."
        },
        {
            id: "design-sequence-api",
            title: "Sequence API",
            category: "design",
            content: "Génère un sequenceDiagram Mermaid pour [séquence paiement] avec client, backend, services."
        },
        {
            id: "design-sequence-auth",
            title: "Sequence authentification",
            category: "design",
            content: "Écris un sequenceDiagram Mermaid pour un login lié à [séquence login]."
        },
        {
            id: "design-sequence-sync",
            title: "Sequence synchronisation",
            category: "design",
            content: "Crée un sequenceDiagram Mermaid pour la synchronisation de [sync catalogue]."
        },
        {
            id: "design-class-domain",
            title: "Class domain",
            category: "design",
            content: "Génère un classDiagram Mermaid du modèle métier pour [domaine commande]."
        },
        {
            id: "design-class-data",
            title: "Class data model",
            category: "design",
            content: "Écris un classDiagram Mermaid pour les objets de données de [modèle articles]."
        },
        {
            id: "design-class-api",
            title: "Class API",
            category: "design",
            content: "Crée un classDiagram Mermaid pour les objets d'API de [API catalog]."
        },

        // DATA (9)
        {
            id: "data-import",
            title: "Import de données",
            category: "data",
            content: "Définis le process d'import pour [import Excel]: formats (CSV/XLSX/JSON), validations, erreurs, feedback utilisateur."
        },
        {
            id: "data-query",
            title: "Interrogation",
            category: "data",
            content: "Propose des requêtes types pour [requêtes catalogue]: filtres, agrégations, tri, et limites attendues."
        },
        {
            id: "data-analyse",
            title: "Analyse de données",
            category: "data",
            content: "Décris l'analyse à mener sur [analyse ventes]: indicateurs clés, segments, insights attendus."
        },
        {
            id: "data-json-schema",
            title: "Schéma JSON",
            category: "data",
            content: "Propose un schéma JSON pour [schéma JSON]: champs, types, obligations, exemples."
        },
        {
            id: "data-table-model",
            title: "Modèle tableur",
            category: "data",
            content: "Conçois un modèle tableur pour [modèle tableur]: colonnes, types, règles de validation."
        },
        {
            id: "data-quality",
            title: "Qualité des données",
            category: "data",
            content: "Définis les contrôles qualité pour [qualité stocks]: anomalies, doublons, valeurs manquantes."
        },
        {
            id: "data-ocr",
            title: "OCR extraction",
            category: "data",
            content: "À partir d'images ou captures d'écran issues d'un partage d'écran [OCR factures], extrais le texte et structure-le en données exploitables."
        },
        {
            id: "data-reporting",
            title: "Reporting",
            category: "data",
            content: "Propose un reporting pour [reporting finance]: tableaux, graphiques, périodicité, audience."
        },
        {
            id: "data-mapping",
            title: "Mapping data",
            category: "data",
            content: "Définis un mapping entre données source et cible pour [mapping ERP]."
        },

        // IA (9)
        {
            id: "ia-usage",
            title: "Usage IA",
            category: "ia",
            content: "Définis un usage IA pour [assistant support]: tâches assistées, niveau d'autonomie, garde-fous."
        },
        {
            id: "ia-evaluation",
            title: "Évaluation IA",
            category: "ia",
            content: "Conçois un plan d'évaluation IA pour [évaluation FAQ]: datasets, métriques, revue humaine, seuils go/no-go."
        },
        {
            id: "ia-ux",
            title: "UX IA",
            category: "ia",
            content: "Décris l'expérience IA pour [UX copilote]: transparence, feedback, contrôle utilisateur, fallback."
        },
        {
            id: "ia-qualite",
            title: "Qualité IA",
            category: "ia",
            content: "Définis les critères de qualité IA pour [qualité réponses]: précision, couverture, biais, hallucinations."
        },
        {
            id: "ia-donnees",
            title: "Données IA",
            category: "ia",
            content: "Planifie les données nécessaires à [données feedback]: sources, gouvernance, cycle de vie, conformité."
        },
        {
            id: "ia-guardrails",
            title: "Garde-fous",
            category: "ia",
            content: "Propose des garde-fous pour [garde-fous IA]: validation humaine, limites, monitoring, audit."
        },
        {
            id: "ia-fallback",
            title: "Fallback",
            category: "ia",
            content: "Définis le fallback pour [fallback manuel] en cas d'échec IA: parcours alternatif, message, support."
        },
        {
            id: "ia-performance",
            title: "Performance IA",
            category: "ia",
            content: "Optimise la performance IA de [performance IA]: latence cible, coût, cache, fréquence d'appel."
        },
        {
            id: "ia-compliance",
            title: "Conformité",
            category: "ia",
            content: "Vérifie la conformité IA de [conformité IA]: RGPD, consentement, traçabilité, droits."
        }
    ];

    global.GoToolkitPromptShortcuts = {
        prompts: promptShortcuts,
        categories: promptCategories
    };
})(window);
