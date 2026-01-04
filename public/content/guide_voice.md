# Module Voice

La page `voice.html` transforme chaque conversation vocale en un canevas complet : enregistrement, transcription, speakers, résumé.

## 1. Enregistrement & streaming
- L’utilisateur déclenche l’enregistrement puis l’interface collecte le flux audio tout en affichant l’état d’écoute. L’idée est d’écrire facilement un sujet, une réunion ou un brainstorming sans toucher le clavier.
- Chaque enregistrement est envoyé à un service STT (AssemblyAI) via un proxy (workers/assemblyai-proxy) qui gère l’authentification et contourne les limites CORS.

## 2. Transcription & diarisation
- Dès la fin de l’enregistrement, une transcription s’affiche dans `voice.html`; elle est segmentée par locuteur grâce à la diarisation d’AssemblyAI et associe chaque segment à un identifiant de participant.
- La page garde un suivi par sujet/participant et permet de corriger les noms avant de générer le verbatim final.

## 3. Résumés & partage
- Le module propose des exports (texte, PDF, share) et un panneau “subjects / participants” pour structurer les résumés par thème.
- Chaque session est historisée dans la collection `voices` du système de partage et peut être réouverte ou partagée via les URL construites avec `GoToolkitShareWorker`. L’historique local conserve aussi les drafts dans IndexedDB.

## 4. Sécurité & expérience
- L’utilisateur contrôle ses données : les clés AssemblyAI sont fournies côté client, le worker ne contient aucun secret, et les quotas/RATE_LIMIT sont gérés sur la plateforme Cloudflare.
- Si l’enregistrement est interrompu ou que la transcription échoue, des messages explicites guident la reprise.
