# **Démarche d'analyse PO**

## **Spécifications fonctionnelles**

Elles sont représentés par la User Story qui décrit l'ensemble des critères d'acceptation avec

### **Le parcours utilisateur**

Un diagramme de flux pour décrire le processus métier d'ensemble dans lequel l'US s'insère. Il est composé d'un enchaînement des étapes métiers dans plusieurs scénarios dont les cas métiers limites à définir ci-joint

### **Les cas métiers** 

Ils nécessitent une gestion au niveau applicative les risques (impact \* fréquence) et les solutions proposées (prévention et/ou correction) notamment :

-   tentative de renseigner plusieurs fois un faux code
    
-   résultat d'examen expiré ou supprimé
    
-   téléchargement interrompu en cours
    
-   lien de téléchargement invalide
    
-   mail non reçu ou perdu mais le patient sait qu'il a les résultats
    
-   résultat d'examen mis à jour ou corrigé par le labo,
    
-   patient handicapé ou dépendant ne pouvant accéder lui-même au résultat 
    
-   erreur dans le nom de famille ou la date de naissance dans la base des patients
    
-   ...
    

### **Le découpage**

Cette analyse exhaustive permet ensuite d'arbitrer l'incrément qui sera livré en priorité. Pn indique dans la US, les cas qui ne seront pas couverts avec en tête :

-   MUST : À couvrir par la US. Ce sont les critères d'acceptation de la US
    
-   SHOULD : À couvrir si opportun ou dans une prochaine US avec une certitude élevée, qu'on va spécifier néanmoins
    
-   COULD : À couvrir ultérieurement éventuellement, qu'on ne va pas forcément spécifier là.
    
-   WON'T : Ne sera pas couvert
    

### **Les maquettes graphiques**

Ils tiennent compte des cas ci-dessus (MUST + SHOULD)

-   les règles de validation (front)
    
-   les wireframes (N/B simple) avec une description des intitulés, des aides à la saisie (helpers) etc
    

## **Spécifications techniques**

### **Structure des échanges**

Un diagramme de séquence décrit les interactions entre les acteurs humains / systèmes. Dans notre cas :

-   Patient
    
-   Interface web
    
-   Base de données des patients
    
-   Base de données des résultats
    
-   Laboratoire
    
-   ...
    

### **Structure de données**

-   Un diagramme d'objets d'ensemble
    
-   Les tableaux de définition :  utilisateurs <-> demandes de téléchargement <-> résultats médicaux <-> ...
    
    -   nom du champs et arborescence
        
    -   type de relationnel (1..1,1..n, 0..n, 0..1)
        
    -   format de données / règles de validation (back)
        
    -   description
        
    -   exemple
        

### **Format des échanges**

-   Les requêtes API sur les événements déduites du diagramme de séquence :
    
    -   je clique sur le lien de mon mail (GET)
        
    -   je saisis le code vérification sur le site (POST requête)
        
    -   le site interroge la base de données pour récupérer les infos du patient (GET interne)
        
    -   le site renvoie le résultat avec le lien du fichier ou pas (POST réponse) : avec les cas de réponse possibles)
        

# **Artefacts PO**

| Cas limite | Priorité = Impact \\\* Probabilité | Issue probable | Pistes de solution (contournement, développement correctif ou préventif) |
| --- | --- | --- | --- |
| Tentative de renseigner plusieurs fois un faux code | 12 = 4 \\\* 3 | Accès bloqué, suspicion d’abus | Validation du code côté serveur, verrouillage après X essais, alerte sécurité |
| Résultat d'examen expiré ou supprimé | 10 = 5 \\\* 2 | Perte d’accès au résultat | Notification avant expiration, archivage sécurisé, récupération via support |
| Téléchargement interrompu en cours | 12 = 3 \\\* 4 | Fichier incomplet, frustration utilisateur | Reprise de téléchargement, checksum, UI de reprise |
| Lien de téléchargement invalide | 12 = 4 \\\* 3 | Erreur 404, perte de confiance | Génération de liens temporaires, vérification d’intégrité, logs d’erreur |
| Mail non reçu ou perdu mais le patient sait qu'il a les résultats | 6 = 3 \\\* 2 | Doute sur la disponibilité | Envoi de rappel SMS, page d’aide, support téléphonique |
| Résultat d'examen mis à jour ou corrigé par le labo | 8 = 4 \\\* 2 | Version obsolète affichée | Versioning des résultats, notification de mise à jour, rafraîchissement automatique |
| Patient handicapé ou dépendant ne pouvant accéder lui‑même au résultat | 10 = 5 / 2 | Accès impossible | Interface accessible, assistance téléphonique, délégation d’accès à un tiers |
| Erreur dans le nom de famille ou la date de naissance dans la base des patients | 4 / 3 | Recherche infructueuse, mauvaise délivrance | Double vérification à l’entrée, correction via support, logs d’audit |
| ... |  |  |  |

```mermaid
%% Title Suivi dépistage patients
graph TD
    A[Invitation] --> B{Réponse}
    B -->|Oui| C[Planif RDV]
    B -->|Non| Z[Fin]
    C --> D[Test réalisé]
    D --> E[Analyse labo]
    E --> F{Résultat}
    F -->|Négatif| G[Notif Négatif]
    G --> Z
    F -->|Positif| H[Notif Positif]
    H --> I[Consultation]
    I --> J[Suivi patient]
    J --> Z
    F -->|Inconnu| K[Notif Inconnu]
    K --> L[Re‑test]
    L --> D
```

```mermaid
%% Title Processus dépistage cancer
sequenceDiagram
    participant Gestionnaire
    participant Patient
    participant Praticien
    participant Laboratoire
    participant Systeme
    
    Gestionnaire->>Patient: Invitation
    Patient->>Gestionnaire: Confirmation
    Patient->>Praticien: Demande RDV
    Praticien->>Gestionnaire: Planif RDV
    Gestionnaire->>Patient: RDV confirmé
    Patient->>Praticien: Test réalisé
    Praticien->>Laboratoire: Envoi échantillon
    Laboratoire->>Systeme: Résultat
    Systeme->>Praticien: Résultat dispo
    Praticien->>Patient: Notification
    Patient->>Praticien: Consultation
    Praticien->>Gestionnaire: Suivi
```

```mermaid
%% Title Suivi dépistage cancers
classDiagram
    class Patient {
        +id
        +nom
        +dateNaissance
    }
    class DossierPatient {
        +id
        +dateCréation
    }
    class Screening {
        +type
        +date
    }
    class Resultat {
        +valeur
        +date
    }
    class Laboratoire {
        +id
        +nom
    }
    class Praticien {
        +id
        +nom
    }
    class Gestionnaire {
        +id
        +nom
    }
    class Invitation {
        +dateEnvoi
    }
    class Notification {
        +dateEnvoi
    }
    
    Patient "1" --> "1" DossierPatient : possède
    DossierPatient "1" *-- "0..*" Screening : contient
    Screening "1" --> "1" Resultat : produit
    Screening "1" --> "1" Laboratoire : envoie
    Screening "1" --> "1" Praticien : prescrit
    Gestionnaire "1" --> "0..*" Invitation : envoie
    Gestionnaire "1" --> "0..*" Notification : informe
    Notification "1" --> "1" Patient : informe
```

| \*\*Champ\*\* | Format | \*\*Relationnel\*\* | \*\*Description\*\* | \*\*Exemple\*\* |
| --- | --- | --- | --- | --- |
| \`patientId\` | \`string\` (UUID) | 1..1 | Identifiant unique du patient dans le système | \`123e4567-e89b-12d3-a456-426614174000\` |
| \`nom\` | \`string\` | 1..1 | Nom de famille du patient | \`Dupont\` |
| \`prenom\` | \`string\` | 1..1 | Prénom du patient | \`Marie\` |
| \`dateNaissance\` | \`date\` (ISO 8601) | 1..1 | Date de naissance | \`1975-04-23\` |
| \`sexe\` | \`enum\` (\`M\`, \`F\`, \`X\`) | 1..1 | Sexe du patient | \`F\` |
| \`adresse\` | \`object\` | 0..1 | Adresse postale complète | \`{ "rue": "12 rue de la Paix", "codePostal": "75002", "ville": "Paris", "pays": "FR" }\` |
| \`numeroSS\` | \`string\` | 1..1 | Numéro de sécurité sociale (chiffré) | \`1 84 12 75 123 456 78\` |
| \`contact\` | \`object\` | 0..1 | Coordonnées de contact | \`{ "email": "\[marie.dupont@example.com\](mailto:marie.dupont@example.com)", "telephone": "+33 6 12 34 56 78" }\` |
| \`dossiersClinique\` | \`array\` of \`object\` | 0..n | Historique des dossiers cliniques (screenings, résultats, etc.) | Voir ci‑dessous |
| \`dateCreation\` | \`datetime\` (ISO 8601) | 1..1 | Date de création du dossier | \`2023-01-15T10:30:00Z\` |
| \`dateModification\` | \`datetime\` (ISO 8601) | 1..1 | Dernière mise à jour du dossier | \`2024-02-20T14:45:00Z\` |

ddd

**POST /api/resultats**  
Récupère le document de résultat associé à un code de vérification.

-   **Déclencheur**
    

L'utilisateur clique sur le lien de téléchargement dans l'email de notification des résultats depuis sa boîte de messagerie

-   **Objet de la requête** (JSON)
    
    ```
    {
      "codeVerification": "string (6‑8 caractères alphanumériques)",
      "patientId": "UUID du patient"
    }
    ```
    
-   **Réponses**
    
    -   `200 OK` :
        
        ```
        {
          "documentUrl": "https://.../resultat.pdf",
          "mimeType": "application/pdf",
          "expiration": "2024-12-31T23:59:59Z"
        }
        ```
        
    -   `400 Bad Request` : code manquant ou format invalide.
        
    -   `401 Unauthorized` : token d’accès invalide.
        
    -   `404 Not Found` : aucun résultat correspondant.
        
-   **Sécurité** : Authentification Bearer JWT dans l’en‑tête `Authorization`.
    
-   **Contraintes** : Le code est valable 48 h, une seule utilisation.
    

**Exemple d’appel**

```
curl -X POST https://api.exemple.com/api/resultats \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"codeVerification":"AB12CD34","patientId":"123e4567-e89b-12d3-a456-426614174000"}'
```