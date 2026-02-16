(function (global) {
    const promptCategories = {
        strategie: { label: "STRATEGIE", icon: "target" },
        discovery: { label: "DISCOVERY", icon: "compass" },
        organisation: { label: "ORGANISATION", icon: "users" },
        metrics: { label: "KPIS", icon: "bar-chart-3" },
        support: { label: "SUPPORT", icon: "life-buoy" },
        delivery: { label: "DELIVERY", icon: "rocket" },
        tech: { label: "TECH", icon: "cpu" },
        design: { label: "DESIGN", icon: "palette" },
        data: { label: "DATA", icon: "database" },
        texte: { label: "TEXTE", icon: "text" },
        rh: { label: "RH", icon: "id-card" },
        ia: { label: "IA", icon: "sparkles" },
        uxui: { label: "UX/UI", icon: "layout" },
        communication: { label: "COMMUNICATION", icon: "mail" }
    };

    const promptShortcuts = [
        // STRATEGIE (9)
        {
            id: "strat-cadrage-produit",
            title: "Cadrage produit",
            category: "strategie",
            content: "Aide-moi à cadrer l'initiative avec un format exploitable. Donne: Contexte, Problème, Objectif, Hypothèses clés, KPI principaux, Hors périmètre, Risques, Questions ouvertes, et un résumé en 3 lignes. Contexte : [lancement CRM]."
        },
        {
            id: "strat-vision-succes",
            title: "Définition du succès",
            category: "strategie",
            content: "Définis ce que signifie le succès pour le produit. Propose: North Star Metric, 3 KPI secondaires, garde-fous, horizon temporel, et seuils de réussite chiffrés. Contexte : [refonte checkout]."
        },
        {
            id: "strat-positionnement",
            title: "Vision produit",
            category: "strategie",
            content: "À partir d'un objectif long terme et d'un besoin utilisateur, rédige une vision produit concise, inspirante et ancrée dans des résultats concrets. Donne aussi 2-3 principes directeurs. Contexte : [objectif produit]."
        },
        {
            id: "strat-roadmap-now-next-later",
            title: "Roadmap Now/Next/Later",
            category: "strategie",
            content: "Crée une roadmap Now/Next/Later. Pour chaque item: objectif, livrable, dépendances, risque, métrique de validation, et impact attendu. Contexte : [portail partenaires]."
        },
        {
            id: "strat-rollout",
            title: "Stratégie de rollout",
            category: "strategie",
            content: "Propose une stratégie de rollout progressive: cohortes, critères d'éligibilité, observabilité, plan de rollback, et plan de communication. Contexte : [déploiement Europe]."
        },
        {
            id: "strat-priorisation",
            title: "Priorisation",
            category: "strategie",
            content: "Priorise des initiatives de roadmap à partir de scores d'impact, d'effort et d'alignement stratégique. Donne l'ordre recommandé, la justification par item, et les arbitrages. Données : [liste initiatives]."
        },
        {
            id: "strat-business-case",
            title: "Modèles de monétisation",
            category: "strategie",
            content: "À partir de la valeur produit et de l'audience, propose 3 modèles de monétisation. Pour chacun: principes, avantages, limites, exemples d'entreprises et conditions de réussite. Contexte : [produit & audience]."
        },
        {
            id: "strat-parties-prenantes",
            title: "Parties prenantes",
            category: "strategie",
            content: "Cartographie les parties prenantes: objectifs, attentes, influence, risques d'alignement, et plan d'alignement. Contexte : [alignement comex]."
        },
        {
            id: "strat-objectifs-okrs",
            title: "OKR",
            category: "strategie",
            content: "Propose des OKR: 1 objectif clair et 3 résultats clés mesurables, avec baseline et cible. Contexte : [OKR trimestre]."
        },

        // DISCOVERY (9)
        {
            id: "disc-story-map",
            title: "Story mapping",
            category: "discovery",
            content: "Construis une story map. Donne: activités haut niveau, tâches, variations, MVP et V1, plus les hypothèses de valeur par étape. Contexte : [inscription en ligne]."
        },
        {
            id: "disc-personas",
            title: "Personas",
            category: "discovery",
            content: "Définis 2-3 personas avec objectifs, frustrations, contexte d'usage, motivations d'achat et critères de succès. Contexte : [prospection B2B]."
        },
        {
            id: "disc-jtbd",
            title: "Jobs To Be Done",
            category: "discovery",
            content: "Formule les JTBD (quand..., je veux..., afin de...) et indique les résultats attendus mesurables. Contexte : [support premium]."
        },
        {
            id: "disc-parcours-ux",
            title: "Parcours UX",
            category: "discovery",
            content: "Décris le parcours UX: étapes, points de friction, moments de vérité, microcopie, états vides, erreurs. Contexte : [parcours commande]."
        },
        {
            id: "disc-copy-ux",
            title: "Value Proposition Canvas",
            category: "discovery",
            content: "Construis un Value Proposition Canvas: jobs, pains, gains, produits/services, pain relievers, gain creators, et preuves prioritaires. Contexte : [offre B2B]."
        },
        {
            id: "disc-hypotheses",
            title: "Lean Proposition Canvas",
            category: "discovery",
            content: "Rédige un Lean Proposition Canvas: problème, segments, proposition de valeur, solution, canaux, revenus, coûts, métriques clés, avantage injuste, et hypothèses à tester. Contexte : [nouveau produit]."
        },
        {
            id: "disc-pain-points",
            title: "Pain points",
            category: "discovery",
            content: "Identifie les pain points principaux, leur impact utilisateur et les indicateurs qui les prouvent. Contexte : [abandons panier]."
        },
        {
            id: "disc-opportunites",
            title: "Opportunités",
            category: "discovery",
            content: "À partir d'un lot de feedback clients, identifie les pain points et propose 5 idées de fonctionnalités qui adressent les thèmes récurrents. Donne impact, effort et preuve. Contexte : [feedback clients]."
        },
        {
            id: "disc-interviews",
            title: "Guide d'entretien",
            category: "discovery",
            content: "Prépare un guide d'entretien utilisateur: objectifs, questions, signaux à observer, et biais à éviter. Contexte : [entretiens clients]."
        },

        // ORGANISATION (9)
        {
            id: "org-compte-rendu",
            title: "CR de réunion",
            category: "organisation",
            content: "Rédige un compte rendu avec retranscription et partage d'écran: décisions, actions, points ouverts, risques, prochaines étapes, et owners. Contexte : [réunion produit]."
        },
        {
            id: "org-plan-action",
            title: "Plan d'action",
            category: "organisation",
            content: "Établis un plan d'action: action, owner, échéance, dépendances, critères de succès, et effort estimé. Contexte : [plan action]."
        },
        {
            id: "org-raci",
            title: "RACI",
            category: "organisation",
            content: "Crée un RACI avec rôles et responsabilités, et les points de décision clés. Contexte : [RACI programme]."
        },
        {
            id: "org-support-ops",
            title: "Support & Ops",
            category: "organisation",
            content: "Prépare le support: runbook, FAQ, escalade, métriques support, et canaux de communication. Contexte : [runbook incident]."
        },
        {
            id: "org-communication",
            title: "Plan de communication",
            category: "organisation",
            content: "Propose un plan de communication: audiences, messages, canaux, calendrier, feedback attendu, et risques de message. Contexte : [annonce release]."
        },
        {
            id: "org-rituels",
            title: "Rituels d'équipe",
            category: "organisation",
            content: "Définis les rituels: cadence, objectifs, participants, livrables, et critères d'efficacité. Contexte : [rituels squad]."
        },
        {
            id: "org-transcription",
            title: "Retranscription vocale",
            category: "organisation",
            content: "Transforme (audio + partage d'écran) en transcription structurée: points clés, décisions, actions, questions, et points de suivi. Contexte : [atelier roadmap]."
        },
        {
            id: "org-ocr-notes",
            title: "OCR notes",
            category: "organisation",
            content: "Analyse une image et extrait les notes puis structure en décisions, actions, risques, et prochaines étapes. Contexte : [photo tableau]."
        },
        {
            id: "org-ocr-process",
            title: "OCR processus",
            category: "organisation",
            content: "À partir d'une capture d'écran, détecte le texte et propose un résumé opérationnel exploitable avec priorités. Contexte : [screenshot backlog]."
        },

        // KPIS (9)
        {
            id: "met-plan-experiment",
            title: "Plan d'expérimentation",
            category: "metrics",
            content: "À partir de changements d'UI listés, propose 2 setups d'A/B test: hypothèse, variantes, métrique de succès, durée, critères d'arrêt, et risques de biais. Contexte : [changements UI]."
        },
        {
            id: "met-instrumentation",
            title: "Plan d'instrumentation",
            category: "metrics",
            content: "Définis un plan d'instrumentation: événements, propriétés, funnels, dashboards, alertes, et logique de nommage. Contexte : [tracking événements]."
        },
        {
            id: "met-kpi-dashboard",
            title: "Dashboard KPI",
            category: "metrics",
            content: "Conçois un dashboard KPI: 5-7 tuiles, définitions exactes, fréquence, source de vérité, et propriétaires. Contexte : [dashboard exec]."
        },
        {
            id: "met-risques",
            title: "Analyse des risques",
            category: "metrics",
            content: "Liste les risques (produit, technique, data, légal, sécurité). Pour chacun: probabilité, impact, mitigation, et signaux d'alerte. Contexte : [risques projet]."
        },
        {
            id: "met-securite-privacy",
            title: "Sécurité & privacy",
            category: "metrics",
            content: "Identifie les enjeux sécurité/privacy et propose des garde-fous mesurables et auditables. Contexte : [données sensibles]."
        },
        {
            id: "met-qualite",
            title: "Qualité & SLA",
            category: "metrics",
            content: "Définis les métriques de qualité: SLA/SLO, seuils d'alerte, plan de monitoring, et plan d'escalade. Contexte : [SLA support]."
        },
        {
            id: "met-funnel",
            title: "Funnel",
            category: "metrics",
            content: "Construis un funnel avec étapes, conversion attendue, points de drop-off, et hypothèses d'optimisation. Contexte : [funnel activation]."
        },
        {
            id: "met-cohortes",
            title: "Cohortes",
            category: "metrics",
            content: "Propose une analyse de cohortes: segmentation, métriques suivies, lecture business, et actions recommandées. Contexte : [cohortes nouveaux]."
        },
        {
            id: "met-alertes",
            title: "Alertes",
            category: "metrics",
            content: "Définis les alertes clés: signaux faibles, seuils, réponse opérationnelle, et owners. Contexte : [alertes churn]."
        },

        // SUPPORT (4)
        {
            id: "support-doc-tech",
            title: "Documentation technique",
            category: "support",
            content: "Rédige une documentation technique: prérequis, installation, configuration, endpoints, erreurs courantes, exemples, et guide de troubleshooting. Contexte : [API interne]."
        },
        {
            id: "support-sla-process",
            title: "Processus SLA",
            category: "support",
            content: "Décris le processus SLA: niveaux d'incident, délais, escalade, rôles, communication, post-mortem, et critères de sortie. Contexte : [support client]."
        },
        {
            id: "support-faq",
            title: "Foire aux questions",
            category: "support",
            content: "Crée une FAQ structurée: questions clés, réponses courtes, liens utiles, cas limites, et erreurs fréquentes. Contexte : [nouvelle fonctionnalité]."
        },
        {
            id: "support-tutoriel",
            title: "Tutoriel",
            category: "support",
            content: "Écris un tutoriel pas à pas: objectifs, étapes numérotées, captures suggérées, check final, et astuces. Contexte : [prise en main]."
        },
        {
            id: "support-runbook",
            title: "Runbook incident",
            category: "support",
            content: "Rédige un runbook d'incident: symptômes, diagnostic, actions immédiates, escalade, communication, et validations post-fix. Contexte : [incident prod]."
        },
        {
            id: "support-base-connaissance",
            title: "Base de connaissances",
            category: "support",
            content: "Structure une base de connaissances: catégories, articles types, taggage, règles de mise à jour, et gouvernance. Contexte : [KB support]."
        },
        {
            id: "support-templates-reponse",
            title: "Templates de réponse",
            category: "support",
            content: "Crée des templates de réponse: accusé de réception, résolution, relance, fermeture, et ton recommandé. Contexte : [support client]."
        },
        {
            id: "support-troubleshooting",
            title: "Guide de dépannage",
            category: "support",
            content: "Propose un guide de dépannage: checklist, causes probables, tests, solutions, et signaux d'escalade. Contexte : [bug récurrent]."
        },
        {
            id: "support-escalade",
            title: "Escalade",
            category: "support",
            content: "Définis le process d'escalade: critères, niveaux, délais, responsabilités, canal, et SLA par niveau. Contexte : [incident critique]."
        },

        // DELIVERY (9)
        {
            id: "del-user-story",
            title: "User story + AC",
            category: "delivery",
            content: "Écris une user story et des critères d'acceptation en Gherkin, avec cas limites et exclusions. Contexte : [user story]."
        },
        {
            id: "del-spec-fonctionnelle",
            title: "Spec fonctionnelle",
            category: "delivery",
            content: "Rédige une spec fonctionnelle: objectif, scope, user flows, règles métier, erreurs, permissions, et non-objectifs. Contexte : [spécif commande]."
        },
        {
            id: "del-plan-delivery",
            title: "Plan de delivery",
            category: "delivery",
            content: "Décompose la livraison: phases, jalons, dépendances, critères de passage, et risques. Contexte : [plan delivery]."
        },
        {
            id: "del-release-checklist",
            title: "Checklist release",
            category: "delivery",
            content: "Crée une checklist de release: feature flags, migration, monitoring, rollback, doc interne, et validation QA. Contexte : [release v1]."
        },
        {
            id: "del-qa",
            title: "Plan de test",
            category: "delivery",
            content: "Propose un plan de test: cas nominaux, cas limites, non-régression, et critères de passage. Contexte : [test régression]."
        },
        {
            id: "del-acceptance",
            title: "Critères de passage",
            category: "delivery",
            content: "Définis les critères de passage: qualité, perf, UX, data, support, et seuils chiffrés. Contexte : [critères go]."
        },
        {
            id: "del-rollout",
            title: "Plan de déploiement",
            category: "delivery",
            content: "Propose un plan de déploiement: étapes, rollback, communication, monitoring, et check post-release. Contexte : [déploiement canary]."
        },
        {
            id: "del-formation",
            title: "Formation",
            category: "delivery",
            content: "Prépare la formation: audiences, supports, objectifs, évaluation, et plan d'adoption. Contexte : [formation interne]."
        },
        {
            id: "del-documentation",
            title: "Documentation",
            category: "delivery",
            content: "Structure la documentation: guide utilisateur, FAQ, procédures, glossaire, et plan de maintenance. Contexte : [doc utilisateur]."
        },

        // UX/UI (9)
        {
            id: "uxui-ab-testing",
            title: "A/B testing UX",
            category: "uxui",
            content: "Propose un test A/B UX: hypothèse, variantes, métrique de succès, durée, critères d'arrêt, et risques d'interprétation. Contexte : [page pricing]."
        },
        {
            id: "uxui-prototypage",
            title: "Prototypage rapide",
            category: "uxui",
            content: "Décris un plan de prototypage: objectifs, écrans clés, interactions, outils, validation, et feedback attendu. Contexte : [MVP]."
        },
        {
            id: "uxui-ui-audit",
            title: "Audit d'interface",
            category: "uxui",
            content: "Réalise un audit d'interface: cohérence visuelle, hiérarchie, accessibilité, points de friction, et quick wins. Contexte : [back-office]."
        },
        {
            id: "uxui-html-css",
            title: "Compréhension HTML/CSS",
            category: "uxui",
            content: "Explique un bloc UI en HTML/CSS: structure, styles clés, responsive, accessibilité, et bonnes pratiques. Contexte : [composant carte]."
        },
        {
            id: "uxui-wireframe",
            title: "Wireframe fonctionnel",
            category: "uxui",
            content: "Propose un wireframe: zones, priorités d'information, interactions, états, et contraintes de contenu. Contexte : [dashboard]."
        },
        {
            id: "uxui-heuristiques",
            title: "Évaluation heuristique",
            category: "uxui",
            content: "Évalue l'UX avec les heuristiques: problèmes, gravité, recommandations, et impact sur conversion. Contexte : [parcours paiement]."
        },
        {
            id: "uxui-flow-onboarding",
            title: "Flow d'onboarding",
            category: "uxui",
            content: "Génère un flowDiagram Mermaid pour l'onboarding: étapes, décisions, sorties, et points de friction. Contexte : [activation]."
        },
        {
            id: "uxui-flow-support",
            title: "Flow d'assistance",
            category: "uxui",
            content: "Crée un flowDiagram Mermaid pour le support: self-serve, escalade, résolution, et temps cible. Contexte : [support produit]."
        },
        {
            id: "uxui-flow-checkout",
            title: "Flow de checkout",
            category: "uxui",
            content: "Écris un flowDiagram Mermaid du checkout: étapes, erreurs, alternatives, et messages clés. Contexte : [paiement]."
        },

        // TECH (9)
        {
            id: "tech-contrat-api",
            title: "Contrat API",
            category: "tech",
            content: "Propose un contrat API: endpoints, payloads, erreurs, pagination, exemples, et conventions de versioning. Contexte : [API paiement]."
        },
        {
            id: "tech-schema-donnees",
            title: "Modèle de données",
            category: "tech",
            content: "Conçois un modèle de données: entités, champs, relations, contraintes, index, et règles d'intégrité. Contexte : [schéma commandes]."
        },
        {
            id: "tech-tradeoffs",
            title: "Trade-offs",
            category: "tech",
            content: "Compare 2-3 options d'implémentation avec impacts coût, perf, maintenance, et risques. Contexte : [option SSO]."
        },
        {
            id: "tech-dette",
            title: "Dette technique",
            category: "tech",
            content: "Évalue la dette technique et propose un plan de réduction priorisé avec effort/impact. Contexte : [dette historique]."
        },
        {
            id: "tech-qualite-data",
            title: "Qualité des données",
            category: "tech",
            content: "Définis des contrôles de qualité data: validations, anomalies, seuils, et plan de correction. Contexte : [qualité leads]."
        },
        {
            id: "tech-archi",
            title: "Architecture",
            category: "tech",
            content: "Décris l'architecture cible: composants, flux, dépendances, contraintes, et décisions clés. Contexte : [architecture cible]."
        },
        {
            id: "tech-perf",
            title: "Performance",
            category: "tech",
            content: "Propose un plan d'amélioration perf: goulots, métriques, actions, et gains attendus. Contexte : [perf mobile]."
        },
        {
            id: "tech-observability",
            title: "Observabilité",
            category: "tech",
            content: "Définis la stratégie d'observabilité: logs, métriques, traces, dashboards, et alerting. Contexte : [observabilité API]."
        },
        {
            id: "tech-securite",
            title: "Sécurité applicative",
            category: "tech",
            content: "Identifie les points de sécurité et les contrôles à mettre en place, avec priorités. Contexte : [sécurité sessions]."
        },

        // COMMUNICATION (9)
        {
            id: "com-email-status",
            title: "Mise à jour de statut",
            category: "communication",
            content: "Rédige un message de statut pour parties prenantes: avancées, risques, prochaines étapes, besoin d'arbitrage, et décisions attendues. Contexte : [projet en cours]."
        },
        {
            id: "com-email-incident",
            title: "Communication d'incident",
            category: "communication",
            content: "Rédige une communication d'incident: impact, périmètre, actions en cours, ETA, prochaine mise à jour, canal de contact, et message d'excuse mesuré. Contexte : [incident prod]."
        },
        {
            id: "com-email-release",
            title: "Annonce de release",
            category: "communication",
            content: "Rédige une annonce de release (style newsletter): nouveautés, changements, impacts, support, liens utiles, et call-to-action. Contexte : [release]."
        },
        {
            id: "com-email-feedback",
            title: "Demande de feedback ciblée",
            category: "communication",
            content: "Rédige une demande de feedback ciblée: objectif, questions clés, délai, format attendu, bénéfice pour le répondant, et incentive éventuel. Contexte : [beta]."
        },
        {
            id: "com-email-alignment",
            title: "Demande d'alignement",
            category: "communication",
            content: "Rédige une demande d'alignement: décision attendue, options, recommandation, date limite, risques de non-décision, et next step par défaut. Contexte : [arbitrage]."
        },
        {
            id: "com-email-roadmap",
            title: "Partage de roadmap",
            category: "communication",
            content: "Rédige un partage de roadmap pour stakeholders: vision, priorités, dates, dépendances, et attentes vis-à-vis des équipes. Contexte : [roadmap T2]."
        },
        {
            id: "com-email-reporting",
            title: "Reporting KPI mensuel",
            category: "communication",
            content: "Rédige un reporting KPI mensuel: résultats, tendances, anomalies, actions, décisions proposées, et points à surveiller. Contexte : [KPI mensuels]."
        },
        {
            id: "com-email-customer",
            title: "Note client proactive",
            category: "communication",
            content: "Rédige une note client proactive: contexte, message principal, bénéfices, prochaine action, FAQ courte, et lien d'aide. Contexte : [lancement feature]."
        },
        {
            id: "com-email-followup",
            title: "Relance opérationnelle",
            category: "communication",
            content: "Rédige une relance opérationnelle: rappel, valeur, demande claire, délai, options de réponse, et conséquence en cas d'absence. Contexte : [validation besoin]."
        },

        // DESIGN (9)
        {
            id: "design-flowchart-process",
            title: "Schéma de processus métier",
            category: "design",
            content: "Génère un flowchart Mermaid du processus métier: étapes, décisions, acteurs, entrées/sorties, et points de contrôle. Contexte : [processus validation]."
        },
        {
            id: "design-flowchart-system",
            title: "Cartographie du système",
            category: "design",
            content: "Crée un flowchart Mermaid du système: sources, traitements, intégrations, sorties, points de contrôle, et responsabilités. Contexte : [flux data]."
        },
        {
            id: "design-flowchart-user",
            title: "Parcours client",
            category: "design",
            content: "Écris un flowchart Mermaid du parcours client: étapes, canaux, moments clés, irritants, et opportunités. Contexte : [parcours SAV]."
        },
        {
            id: "design-sequence-api",
            title: "Séquence d'intégration API",
            category: "design",
            content: "Génère un sequenceDiagram Mermaid: client, backend, services tiers, authentification, erreurs, et retry. Contexte : [séquence paiement]."
        },
        {
            id: "design-sequence-auth",
            title: "Séquence d'authentification",
            category: "design",
            content: "Écris un sequenceDiagram Mermaid du login: étapes, tokens, validations, erreurs, et timeouts. Contexte : [séquence login]."
        },
        {
            id: "design-sequence-sync",
            title: "Séquence de synchronisation",
            category: "design",
            content: "Crée un sequenceDiagram Mermaid pour la synchronisation: planification, delta, conflits, reprise, et audit. Contexte : [sync catalogue]."
        },
        {
            id: "design-class-domain",
            title: "Modèle métier (classes)",
            category: "design",
            content: "Génère un classDiagram Mermaid du modèle métier: entités, relations, règles clés, et agrégats. Contexte : [domaine commande]."
        },
        {
            id: "design-class-data",
            title: "Modèle de données applicatif",
            category: "design",
            content: "Écris un classDiagram Mermaid des objets de données: attributs, cardinalités, contraintes, et validations. Contexte : [modèle articles]."
        },
        {
            id: "design-class-api",
            title: "Contrat d'API (classes)",
            category: "design",
            content: "Crée un classDiagram Mermaid pour les objets d'API: requêtes, réponses, erreurs, versions, et compatibilité. Contexte : [API catalog]."
        },

        // DATA (9)
        {
            id: "data-import",
            title: "Import de données",
            category: "data",
            content: "Définis le process d'import: formats (CSV/XLSX/JSON), validations, erreurs, feedback utilisateur, et reprise sur erreur. Contexte : [import Excel]."
        },
        {
            id: "data-query",
            title: "Interrogation",
            category: "data",
            content: "Propose des requêtes types: filtres, agrégations, tri, limites attendues, et cas d'usage métier. Contexte : [requêtes catalogue]."
        },
        {
            id: "data-analyse",
            title: "Analyse de données",
            category: "data",
            content: "Décris l'analyse à mener: indicateurs clés, segments, insights attendus, et actions possibles. Contexte : [analyse ventes]."
        },
        {
            id: "data-json-schema",
            title: "Schéma JSON",
            category: "data",
            content: "Propose un schéma JSON: champs, types, obligations, exemples, et règles de validation. Contexte : [schéma JSON]."
        },
        {
            id: "data-table-model",
            title: "Modèle tableur",
            category: "data",
            content: "Conçois un modèle tableur: colonnes, types, règles de validation, et exemples de valeurs. Contexte : [modèle tableur]."
        },
        {
            id: "data-quality",
            title: "Qualité des données",
            category: "data",
            content: "Définis les contrôles qualité: anomalies, doublons, valeurs manquantes, et seuils d'alerte. Contexte : [qualité stocks]."
        },
        {
            id: "data-ocr",
            title: "OCR extraction",
            category: "data",
            content: "À partir d'images ou captures d'écran issues d'un partage d'écran, extrais le texte et structure-le en données exploitables, avec validation des champs. Contexte : [OCR factures]."
        },
        {
            id: "data-reporting",
            title: "Reporting",
            category: "data",
            content: "Propose un reporting: tableaux, graphiques, périodicité, audience, et décisions attendues. Contexte : [reporting finance]."
        },
        {
            id: "data-mapping",
            title: "Mapping data",
            category: "data",
            content: "Définis un mapping entre données source et cible: champs, transformations, règles, et exceptions. Contexte : [mapping ERP]."
        },

        // TEXTE (9)
        {
            id: "texte-questions",
            title: "Questions clés",
            category: "texte",
            content: "Génère des questions clés pour clarifier: objectifs, contraintes, impacts, priorités, et risques. Contexte : [brief client]."
        },
        {
            id: "texte-resume",
            title: "Résumé exécutif",
            category: "texte",
            content: "Résume en 5 points: objectif, décisions, risques, actions, échéances, et points ouverts. Contexte : [note projet]."
        },
        {
            id: "texte-developper",
            title: "Développer",
            category: "texte",
            content: "Développe en un paragraphe structuré: contexte, valeur, faisabilité, et conditions de succès. Contexte : [idée produit]."
        },
        {
            id: "texte-comparer",
            title: "Comparer",
            category: "texte",
            content: "Compare deux options selon valeur, effort, risques, dépendances, et recommandation. Options : [option A / option B]."
        },
        {
            id: "texte-reformuler",
            title: "Reformuler",
            category: "texte",
            content: "Reformule pour un ton clair, concis et orienté action, avec un titre et un CTA. Contexte : [message interne]."
        },
        {
            id: "texte-clarifier",
            title: "Clarifier",
            category: "texte",
            content: "Clarifie en séparant faits, décisions, actions, questions ouvertes, et propriétaires. Contexte : [compte rendu]."
        },
        {
            id: "texte-extraction",
            title: "Extraction d'actions",
            category: "texte",
            content: "Extrait les actions avec owner, échéance implicite si possible, et dépendances. Contexte : [discussion équipe]."
        },
        {
            id: "texte-synthese",
            title: "Synthèse comparative",
            category: "texte",
            content: "Fais une synthèse comparative: convergences, divergences, arbitrages, et recommandations. Documents : [doc A / doc B]."
        },
        {
            id: "texte-checklist",
            title: "Checklist",
            category: "texte",
            content: "Transforme en checklist opérationnelle prête à l'emploi, avec ordre recommandé. Contexte : [procédure support]."
        },

        // RH (9)
        {
            id: "rh-recrutement",
            title: "Recrutement",
            category: "rh",
            content: "Structure le recrutement: besoin, compétences clés, critères d'évaluation, étapes, et signaux d'alerte. Contexte : [poste data]."
        },
        {
            id: "rh-fiche-poste",
            title: "Fiche de poste",
            category: "rh",
            content: "Rédige une fiche de poste: mission, responsabilités, compétences, niveau attendu, et critères de succès. Contexte : [product analyst]."
        },
        {
            id: "rh-dossier-competences",
            title: "Dossier de compétences",
            category: "rh",
            content: "Constitue un dossier de compétences: expériences, savoir-faire, soft skills, preuves, et impacts. Contexte : [profil senior]."
        },
        {
            id: "rh-formation",
            title: "Plan de formation",
            category: "rh",
            content: "Propose un plan de formation: objectifs, modules, durée, critères de réussite, et évaluation. Contexte : [équipe produit]."
        },
        {
            id: "rh-suivi",
            title: "Suivi",
            category: "rh",
            content: "Construis un suivi: points d'étape, indicateurs, risques, actions, et prochaine revue. Contexte : [objectif individuel]."
        },
        {
            id: "rh-bilan",
            title: "Bilan",
            category: "rh",
            content: "Rédige un bilan: réalisations, impacts, axes d'amélioration, next steps, et objectifs à venir. Contexte : [période semestre]."
        },
        {
            id: "rh-onboarding",
            title: "Onboarding",
            category: "rh",
            content: "Définis un plan d'onboarding: objectifs, parcours, livrables, points de contrôle, et check-ins. Contexte : [nouveau PM]."
        },
        {
            id: "rh-entretien",
            title: "Guide d'entretien",
            category: "rh",
            content: "Prépare un guide d'entretien: questions, cas pratiques, grille d'évaluation, et red flags. Contexte : [candidat tech]."
        },
        {
            id: "rh-evaluation",
            title: "Évaluation",
            category: "rh",
            content: "Élabore un cadre d'évaluation: critères, niveaux, exemples concrets, feedback, et plan d'amélioration. Contexte : [collaborateur]."
        },

        // IA (9)
        {
            id: "ia-classement",
            title: "Classement de données",
            category: "ia",
            content: "Classe des éléments selon un critère métier: score, segment, priorité. Donne les règles, seuils, sources de données, et un exemple. Contexte : [leads]."
        },
        {
            id: "ia-tri-multicritere",
            title: "Tri multi-critères",
            category: "ia",
            content: "Trie une liste selon plusieurs critères pondérés. Indique la pondération, le résultat final, et les arbitrages clés. Contexte : [backlog]."
        },
        {
            id: "ia-notation-criteres",
            title: "Notation selon critères",
            category: "ia",
            content: "Attribue une note à chaque item selon des critères explicites. Donne la grille, la justification, et les cas limites. Contexte : [candidats]."
        },
        {
            id: "ia-detection-anomalies",
            title: "Détection d'anomalies",
            category: "ia",
            content: "Repère les anomalies dans un dataset: valeurs aberrantes, tendances inattendues, ruptures. Explique les signaux et la gravité. Contexte : [transactions]."
        },
        {
            id: "ia-categorisation",
            title: "Catégorisation automatique",
            category: "ia",
            content: "Catégorise des items par thèmes ou typologies métier. Donne la taxonomie, les règles, et un exemple par catégorie. Contexte : [tickets support]."
        },
        {
            id: "ia-priorisation",
            title: "Priorisation intelligente",
            category: "ia",
            content: "Priorise des éléments selon impact, effort, risque. Donne le rang, le score, la justification et les dépendances. Contexte : [features]."
        },
        {
            id: "ia-deduplication",
            title: "Détection de doublons",
            category: "ia",
            content: "Identifie les doublons ou quasi-doublons dans une liste et propose une fusion, avec critères de confiance. Contexte : [comptes clients]."
        },
        {
            id: "ia-scoring-risque",
            title: "Scoring de risque",
            category: "ia",
            content: "Établis un score de risque avec critères, poids, seuils d'action, et recommandations. Contexte : [fraude]."
        },
        {
            id: "ia-signaux-faibles",
            title: "Recherche de signaux faibles",
            category: "ia",
            content: "Repère les signaux faibles dans des données textuelles: thèmes émergents, variations, anomalies, et alertes. Contexte : [verbatims clients]."
        }
    ];

    global.GoToolkitPromptShortcuts = {
        prompts: promptShortcuts,
        categories: promptCategories
    };

})(window);
