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
        texte: { label: "TEXTE", icon: "text" },
        rh: { label: "RH", icon: "id-card" },
        ia: { label: "IA", icon: "sparkles" }
    };

    const promptShortcuts = [
        // STRATEGIE (9)
        {
            id: "strat-cadrage-produit",
            title: "Cadrage produit",
            category: "strategie",
            content: "Aide-moi à cadrer l'initiative. Donne: Contexte, Problème, Objectif, Hypothèses clés, KPI principaux, Hors périmètre, Risques, Questions ouvertes. Contexte : [lancement CRM]."
        },
        {
            id: "strat-vision-succes",
            title: "Définition du succès",
            category: "strategie",
            content: "Définis ce que signifie le succès. Propose: North Star Metric, 3 KPI secondaires, garde-fous, horizon temporel. Contexte : [refonte checkout]."
        },
        {
            id: "strat-positionnement",
            title: "Positionnement",
            category: "strategie",
            content: "Propose un positionnement clair (problème, cible, promesse, différenciation, alternatives). Contexte : [offre freemium]."
        },
        {
            id: "strat-roadmap-now-next-later",
            title: "Roadmap Now/Next/Later",
            category: "strategie",
            content: "Crée une roadmap Now/Next/Later. Pour chaque item: objectif, livrable, dépendances, risque, métrique de validation. Contexte : [portail partenaires]."
        },
        {
            id: "strat-rollout",
            title: "Stratégie de rollout",
            category: "strategie",
            content: "Propose une stratégie de rollout progressive: cohortes, critères d'éligibilité, observabilité, plan de rollback. Contexte : [déploiement Europe]."
        },
        {
            id: "strat-priorisation",
            title: "Priorisation",
            category: "strategie",
            content: "Priorise avec une grille Impact/Effort (ou RICE). Donne le classement, les hypothèses et les incertitudes. Contexte : [backlog Q2]."
        },
        {
            id: "strat-business-case",
            title: "Business case",
            category: "strategie",
            content: "Construis un business case: valeur attendue, coûts, risques, ROI, et scénario pessimiste/réaliste/optimiste. Contexte : [business case]."
        },
        {
            id: "strat-parties-prenantes",
            title: "Parties prenantes",
            category: "strategie",
            content: "Cartographie les parties prenantes: objectifs, attentes, influence, et plan d'alignement. Contexte : [alignement comex]."
        },
        {
            id: "strat-objectifs-okrs",
            title: "OKR",
            category: "strategie",
            content: "Propose des OKR: 1 objectif clair et 3 résultats clés mesurables. Contexte : [OKR trimestre]."
        },

        // DISCOVERY (9)
        {
            id: "disc-story-map",
            title: "Story mapping",
            category: "discovery",
            content: "Construis une story map. Donne: activités haut niveau, tâches, variations, MVP et V1. Contexte : [inscription en ligne]."
        },
        {
            id: "disc-personas",
            title: "Personas",
            category: "discovery",
            content: "Définis 2-3 personas avec objectifs, frustrations, contexte d'usage. Contexte : [prospection B2B]."
        },
        {
            id: "disc-jtbd",
            title: "Jobs To Be Done",
            category: "discovery",
            content: "Formule les JTBD (quand..., je veux..., afin de...). Contexte : [support premium]."
        },
        {
            id: "disc-parcours-ux",
            title: "Parcours UX",
            category: "discovery",
            content: "Décris le parcours UX: étapes, points de friction, microcopie, états vides, erreurs. Contexte : [parcours commande]."
        },
        {
            id: "disc-copy-ux",
            title: "Microcopy",
            category: "discovery",
            content: "Propose la microcopy: titres, CTA, messages d'erreur, feedback succès. Contexte : [écran facture]."
        },
        {
            id: "disc-hypotheses",
            title: "Hypothèses à valider",
            category: "discovery",
            content: "Liste les hypothèses critiques et comment les valider rapidement. Contexte : [hypothèse prix]."
        },
        {
            id: "disc-pain-points",
            title: "Pain points",
            category: "discovery",
            content: "Identifie les pain points principaux et leur impact utilisateur. Contexte : [abandons panier]."
        },
        {
            id: "disc-opportunites",
            title: "Opportunités",
            category: "discovery",
            content: "Décris 5 opportunités produit avec valeur et effort estimés. Contexte : [idéation features]."
        },
        {
            id: "disc-interviews",
            title: "Guide d'entretien",
            category: "discovery",
            content: "Prépare un guide d'entretien utilisateur: objectifs, questions, signaux à observer. Contexte : [entretiens clients]."
        },

        // ORGANISATION (9)
        {
            id: "org-compte-rendu",
            title: "CR de réunion",
            category: "organisation",
            content: "Rédige un compte rendu avec retranscription et partage d'écran: décisions, actions, points ouverts, risques, prochaines étapes. Contexte : [réunion produit]."
        },
        {
            id: "org-plan-action",
            title: "Plan d'action",
            category: "organisation",
            content: "Établis un plan d'action: action, owner, échéance, dépendances, critères de succès. Contexte : [plan action]."
        },
        {
            id: "org-raci",
            title: "RACI",
            category: "organisation",
            content: "Crée un RACI avec rôles et responsabilités. Contexte : [RACI programme]."
        },
        {
            id: "org-support-ops",
            title: "Support & Ops",
            category: "organisation",
            content: "Prépare le support: runbook, FAQ, escalade, métriques support. Contexte : [runbook incident]."
        },
        {
            id: "org-communication",
            title: "Plan de communication",
            category: "organisation",
            content: "Propose un plan de communication: audiences, messages, canaux, calendrier, feedback attendu. Contexte : [annonce release]."
        },
        {
            id: "org-rituels",
            title: "Rituels d'équipe",
            category: "organisation",
            content: "Définis les rituels: cadence, objectifs, participants, livrables. Contexte : [rituels squad]."
        },
        {
            id: "org-transcription",
            title: "Retranscription vocale",
            category: "organisation",
            content: "Transforme (audio + partage d'écran) en transcription structurée: points clés, décisions, actions, questions. Contexte : [atelier roadmap]."
        },
        {
            id: "org-ocr-notes",
            title: "OCR notes",
            category: "organisation",
            content: "Analyse une image et extrait les notes puis structure en décisions, actions, risques. Contexte : [photo tableau]."
        },
        {
            id: "org-ocr-process",
            title: "OCR processus",
            category: "organisation",
            content: "À partir d'une capture d'écran, détecte le texte et propose un résumé opérationnel exploitable. Contexte : [screenshot backlog]."
        },

        // METRIQUES (9)
        {
            id: "met-plan-experiment",
            title: "Plan d'expérimentation",
            category: "metrics",
            content: "Propose un plan d'expérimentation: hypothèse, métrique primaire, population, durée, critères d'arrêt. Contexte : [A/B test]."
        },
        {
            id: "met-instrumentation",
            title: "Plan d'instrumentation",
            category: "metrics",
            content: "Définis un plan d'instrumentation: événements, propriétés, funnels, dashboards, alertes. Contexte : [tracking événements]."
        },
        {
            id: "met-kpi-dashboard",
            title: "Dashboard KPI",
            category: "metrics",
            content: "Conçois un dashboard KPI: 5-7 tuiles, définitions exactes, fréquence, source de vérité. Contexte : [dashboard exec]."
        },
        {
            id: "met-risques",
            title: "Analyse des risques",
            category: "metrics",
            content: "Liste les risques (produit, technique, data, légal, sécurité). Pour chacun: probabilité, impact, mitigation. Contexte : [risques projet]."
        },
        {
            id: "met-securite-privacy",
            title: "Sécurité & privacy",
            category: "metrics",
            content: "Identifie les enjeux sécurité/privacy et propose des garde-fous mesurables. Contexte : [données sensibles]."
        },
        {
            id: "met-qualite",
            title: "Qualité & SLA",
            category: "metrics",
            content: "Définis les métriques de qualité: SLA/SLO, seuils d'alerte, plan de monitoring. Contexte : [SLA support]."
        },
        {
            id: "met-funnel",
            title: "Funnel",
            category: "metrics",
            content: "Construis un funnel avec étapes, conversion attendue, points de drop-off. Contexte : [funnel activation]."
        },
        {
            id: "met-cohortes",
            title: "Cohortes",
            category: "metrics",
            content: "Propose une analyse de cohortes: segmentation, métriques suivies, lecture business. Contexte : [cohortes nouveaux]."
        },
        {
            id: "met-alertes",
            title: "Alertes",
            category: "metrics",
            content: "Définis les alertes clés: signaux faibles, seuils, réponse opérationnelle. Contexte : [alertes churn]."
        },

        // DELIVERY (9)
        {
            id: "del-user-story",
            title: "User story + AC",
            category: "delivery",
            content: "Écris une user story et des critères d'acceptation en Gherkin. Contexte : [user story]."
        },
        {
            id: "del-spec-fonctionnelle",
            title: "Spec fonctionnelle",
            category: "delivery",
            content: "Rédige une spec fonctionnelle: objectif, scope, user flows, règles métier, erreurs, permissions. Contexte : [spécif commande]."
        },
        {
            id: "del-plan-delivery",
            title: "Plan de delivery",
            category: "delivery",
            content: "Décompose la livraison: phases, jalons, dépendances, critères de passage. Contexte : [plan delivery]."
        },
        {
            id: "del-release-checklist",
            title: "Checklist release",
            category: "delivery",
            content: "Crée une checklist de release: feature flags, migration, monitoring, rollback, doc interne. Contexte : [release v1]."
        },
        {
            id: "del-qa",
            title: "Plan de test",
            category: "delivery",
            content: "Propose un plan de test: cas nominaux, cas limites, non-régression. Contexte : [test régression]."
        },
        {
            id: "del-acceptance",
            title: "Critères de passage",
            category: "delivery",
            content: "Définis les critères de passage: qualité, perf, UX, data, support. Contexte : [critères go]."
        },
        {
            id: "del-rollout",
            title: "Plan de déploiement",
            category: "delivery",
            content: "Propose un plan de déploiement: étapes, rollback, communication, monitoring. Contexte : [déploiement canary]."
        },
        {
            id: "del-formation",
            title: "Formation",
            category: "delivery",
            content: "Prépare la formation: audiences, supports, objectifs, évaluation. Contexte : [formation interne]."
        },
        {
            id: "del-documentation",
            title: "Documentation",
            category: "delivery",
            content: "Structure la documentation: guide utilisateur, FAQ, procédures, glossaire. Contexte : [doc utilisateur]."
        },

        // TECH (9)
        {
            id: "tech-contrat-api",
            title: "Contrat API",
            category: "tech",
            content: "Propose un contrat API: endpoints, payloads, erreurs, pagination, exemples. Contexte : [API paiement]."
        },
        {
            id: "tech-schema-donnees",
            title: "Modèle de données",
            category: "tech",
            content: "Conçois un modèle de données: entités, champs, relations, contraintes, index. Contexte : [schéma commandes]."
        },
        {
            id: "tech-tradeoffs",
            title: "Trade-offs",
            category: "tech",
            content: "Compare 2-3 options d'implémentation avec impacts coût, perf, maintenance. Contexte : [option SSO]."
        },
        {
            id: "tech-dette",
            title: "Dette technique",
            category: "tech",
            content: "Évalue la dette technique liée à et propose un plan de réduction. Contexte : [dette historique]."
        },
        {
            id: "tech-qualite-data",
            title: "Qualité des données",
            category: "tech",
            content: "Définis des contrôles de qualité data: validations, anomalies, seuils. Contexte : [qualité leads]."
        },
        {
            id: "tech-archi",
            title: "Architecture",
            category: "tech",
            content: "Décris l'architecture cible: composants, flux, dépendances, contraintes. Contexte : [architecture cible]."
        },
        {
            id: "tech-perf",
            title: "Performance",
            category: "tech",
            content: "Propose un plan d'amélioration perf: goulots, métriques, actions. Contexte : [perf mobile]."
        },
        {
            id: "tech-observability",
            title: "Observabilité",
            category: "tech",
            content: "Définis la stratégie d'observabilité: logs, métriques, traces, dashboards. Contexte : [observabilité API]."
        },
        {
            id: "tech-securite",
            title: "Sécurité applicative",
            category: "tech",
            content: "Identifie les points de sécurité et les contrôles à mettre en place. Contexte : [sécurité sessions]."
        },

        // DESIGN (9)
        {
            id: "design-flowchart-process",
            title: "Flowchart processus",
            category: "design",
            content: "Génère un flowchart Mermaid avec étapes et décisions (oui/non). Contexte : [flux validation]."
        },
        {
            id: "design-flowchart-system",
            title: "Flowchart système",
            category: "design",
            content: "Crée un flowchart Mermaid pour le flux système (sources, traitements, sorties). Contexte : [flux data]."
        },
        {
            id: "design-flowchart-user",
            title: "Flowchart parcours",
            category: "design",
            content: "Écris un flowchart Mermaid du parcours utilisateur. Contexte : [parcours SAV]."
        },
        {
            id: "design-sequence-api",
            title: "Sequence API",
            category: "design",
            content: "Génère un sequenceDiagram Mermaid avec client, backend, services. Contexte : [séquence paiement]."
        },
        {
            id: "design-sequence-auth",
            title: "Sequence authentification",
            category: "design",
            content: "Écris un sequenceDiagram Mermaid pour un login lié à. Contexte : [séquence login]."
        },
        {
            id: "design-sequence-sync",
            title: "Sequence synchronisation",
            category: "design",
            content: "Crée un sequenceDiagram Mermaid pour la synchronisation. Contexte : [sync catalogue]."
        },
        {
            id: "design-class-domain",
            title: "Class domain",
            category: "design",
            content: "Génère un classDiagram Mermaid du modèle métier. Contexte : [domaine commande]."
        },
        {
            id: "design-class-data",
            title: "Class data model",
            category: "design",
            content: "Écris un classDiagram Mermaid pour les objets de données. Contexte : [modèle articles]."
        },
        {
            id: "design-class-api",
            title: "Class API",
            category: "design",
            content: "Crée un classDiagram Mermaid pour les objets d'API. Contexte : [API catalog]."
        },

        // DATA (9)
        {
            id: "data-import",
            title: "Import de données",
            category: "data",
            content: "Définis le process d'import: formats (CSV/XLSX/JSON), validations, erreurs, feedback utilisateur. Contexte : [import Excel]."
        },
        {
            id: "data-query",
            title: "Interrogation",
            category: "data",
            content: "Propose des requêtes types: filtres, agrégations, tri, et limites attendues. Contexte : [requêtes catalogue]."
        },
        {
            id: "data-analyse",
            title: "Analyse de données",
            category: "data",
            content: "Décris l'analyse à mener: indicateurs clés, segments, insights attendus. Contexte : [analyse ventes]."
        },
        {
            id: "data-json-schema",
            title: "Schéma JSON",
            category: "data",
            content: "Propose un schéma JSON: champs, types, obligations, exemples. Contexte : [schéma JSON]."
        },
        {
            id: "data-table-model",
            title: "Modèle tableur",
            category: "data",
            content: "Conçois un modèle tableur: colonnes, types, règles de validation. Contexte : [modèle tableur]."
        },
        {
            id: "data-quality",
            title: "Qualité des données",
            category: "data",
            content: "Définis les contrôles qualité: anomalies, doublons, valeurs manquantes. Contexte : [qualité stocks]."
        },
        {
            id: "data-ocr",
            title: "OCR extraction",
            category: "data",
            content: "À partir d'images ou captures d'écran issues d'un partage d'écran, extrais le texte et structure-le en données exploitables. Contexte : [OCR factures]."
        },
        {
            id: "data-reporting",
            title: "Reporting",
            category: "data",
            content: "Propose un reporting: tableaux, graphiques, périodicité, audience. Contexte : [reporting finance]."
        },
        {
            id: "data-mapping",
            title: "Mapping data",
            category: "data",
            content: "Définis un mapping entre données source et cible. Contexte : [mapping ERP]."
        },

        // TEXTE (9)
        {
            id: "texte-questions",
            title: "Questions clés",
            category: "texte",
            content: "Génère des questions clés pour clarifier: objectifs, contraintes, impacts, priorités. Contexte : [brief client]."
        },
        {
            id: "texte-resume",
            title: "Résumé exécutif",
            category: "texte",
            content: "Résume en 5 points: objectif, décisions, risques, actions, échéances. Contexte : [note projet]."
        },
        {
            id: "texte-developper",
            title: "Développer",
            category: "texte",
            content: "Développe en un paragraphe structuré: contexte, valeur, faisabilité. Contexte : [idée produit]."
        },
        {
            id: "texte-comparer",
            title: "Comparer",
            category: "texte",
            content: "Compare deux options selon valeur, effort, risques, et recommandation. Options : [option A / option B]."
        },
        {
            id: "texte-reformuler",
            title: "Reformuler",
            category: "texte",
            content: "Reformule pour un ton clair, concis et orienté action. Contexte : [message interne]."
        },
        {
            id: "texte-clarifier",
            title: "Clarifier",
            category: "texte",
            content: "Clarifie en séparant faits, décisions, actions, questions ouvertes. Contexte : [compte rendu]."
        },
        {
            id: "texte-extraction",
            title: "Extraction d'actions",
            category: "texte",
            content: "Extrait les actions avec owner et échéance implicite si possible. Contexte : [discussion équipe]."
        },
        {
            id: "texte-synthese",
            title: "Synthèse comparative",
            category: "texte",
            content: "Fais une synthèse comparative: convergences, divergences, arbitrages. Documents : [doc A / doc B]."
        },
        {
            id: "texte-checklist",
            title: "Checklist",
            category: "texte",
            content: "Transforme en checklist opérationnelle prête à l'emploi. Contexte : [procédure support]."
        },

        // RH (9)
        {
            id: "rh-recrutement",
            title: "Recrutement",
            category: "rh",
            content: "Structure le recrutement: besoin, compétences clés, critères d'évaluation, étapes. Contexte : [poste data]."
        },
        {
            id: "rh-fiche-poste",
            title: "Fiche de poste",
            category: "rh",
            content: "Rédige une fiche de poste: mission, responsabilités, compétences, niveau attendu. Contexte : [product analyst]."
        },
        {
            id: "rh-dossier-competences",
            title: "Dossier de compétences",
            category: "rh",
            content: "Constitue un dossier de compétences: expériences, savoir-faire, soft skills, preuves. Contexte : [profil senior]."
        },
        {
            id: "rh-formation",
            title: "Plan de formation",
            category: "rh",
            content: "Propose un plan de formation: objectifs, modules, durée, critères de réussite. Contexte : [équipe produit]."
        },
        {
            id: "rh-suivi",
            title: "Suivi",
            category: "rh",
            content: "Construis un suivi: points d'étape, indicateurs, risques, actions. Contexte : [objectif individuel]."
        },
        {
            id: "rh-bilan",
            title: "Bilan",
            category: "rh",
            content: "Rédige un bilan: réalisations, impacts, axes d'amélioration, next steps. Contexte : [période semestre]."
        },
        {
            id: "rh-onboarding",
            title: "Onboarding",
            category: "rh",
            content: "Définis un plan d'onboarding: objectifs, parcours, livrables, points de contrôle. Contexte : [nouveau PM]."
        },
        {
            id: "rh-entretien",
            title: "Guide d'entretien",
            category: "rh",
            content: "Prépare un guide d'entretien: questions, cas pratiques, grille d'évaluation. Contexte : [candidat tech]."
        },
        {
            id: "rh-evaluation",
            title: "Évaluation",
            category: "rh",
            content: "Élabore un cadre d'évaluation: critères, niveaux, exemples concrets, feedback. Contexte : [collaborateur]."
        },

        // IA (9)
        {
            id: "ia-usage",
            title: "Usage IA",
            category: "ia",
            content: "Définis un usage IA: tâches assistées, niveau d'autonomie, garde-fous. Contexte : [assistant support]."
        },
        {
            id: "ia-evaluation",
            title: "Évaluation IA",
            category: "ia",
            content: "Conçois un plan d'évaluation IA: datasets, métriques, revue humaine, seuils go/no-go. Contexte : [évaluation FAQ]."
        },
        {
            id: "ia-ux",
            title: "UX IA",
            category: "ia",
            content: "Décris l'expérience IA: transparence, feedback, contrôle utilisateur, fallback. Contexte : [UX copilote]."
        },
        {
            id: "ia-qualite",
            title: "Qualité IA",
            category: "ia",
            content: "Définis les critères de qualité IA: précision, couverture, biais, hallucinations. Contexte : [qualité réponses]."
        },
        {
            id: "ia-donnees",
            title: "Données IA",
            category: "ia",
            content: "Planifie les données nécessaires à: sources, gouvernance, cycle de vie, conformité. Contexte : [données feedback]."
        },
        {
            id: "ia-guardrails",
            title: "Garde-fous",
            category: "ia",
            content: "Propose des garde-fous: validation humaine, limites, monitoring, audit. Contexte : [garde-fous IA]."
        },
        {
            id: "ia-fallback",
            title: "Fallback",
            category: "ia",
            content: "Définis le fallback en cas d'échec IA: parcours alternatif, message, support. Contexte : [fallback manuel]."
        },
        {
            id: "ia-performance",
            title: "Performance IA",
            category: "ia",
            content: "Optimise la performance IA: latence cible, coût, cache, fréquence d'appel. Contexte : [performance IA]."
        },
        {
            id: "ia-compliance",
            title: "Conformité",
            category: "ia",
            content: "Vérifie la conformité IA: RGPD, consentement, traçabilité, droits. Contexte : [conformité IA]."
        }
    ];

    global.GoToolkitPromptShortcuts = {
        prompts: promptShortcuts,
        categories: promptCategories
    };
})(window);
