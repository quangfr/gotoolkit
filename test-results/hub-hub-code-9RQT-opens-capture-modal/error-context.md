# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - heading "Go-Toolkit Hub" [level=1] [ref=e5]:
          - img [ref=e6]
          - text: Go-Toolkit Hub
        - generic [ref=e11]: Envoie tes scans et audios dans ton document sur PC
      - generic [ref=e12]:
        - button "Scanner un QR" [ref=e13] [cursor=pointer]:
          - img [ref=e14]
        - button "Entrer un code" [ref=e20] [cursor=pointer]:
          - img [ref=e21]
    - generic [ref=e24]: Aucun document appairé. Scannez un QR Code ou entrez un code session.
  - dialog "Code session" [ref=e25]:
    - generic [ref=e26]:
      - generic [ref=e27]:
        - heading "Code session" [level=3] [ref=e28]:
          - img [ref=e29]
          - text: Code session
        - button "Fermer" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
      - generic [ref=e35]:
        - text: Entrez le code à 4 caractères affiché sur votre Docs.
        - textbox [ref=e36]: 9RQT
        - generic [ref=e37]:
          - button "Annuler" [ref=e38] [cursor=pointer]
          - button "Valider" [active] [ref=e39] [cursor=pointer]
```