# Tera - Assistant CLI avec GPT-4o

Assistant CLI intelligent qui utilise GPT-4o pour automatiser les tâches de développement.

## 🚀 Installation

1. **Installer les dépendances :**
```bash
npm install
```

2. **Configurer votre clé API OpenAI :**
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
```

3. **Installer globalement (optionnel) :**
```bash
npm run install-global
```

## 🎯 Utilisation

### Commande `commit`

Génère automatiquement un message de commit intelligent basé sur vos changements git :

```bash
# D'abord, stagez vos changements
git add .

# Puis utilisez tera pour générer le commit
tera commit
```

**Ce que fait la commande :**
1. ✅ Vérifie que vous êtes dans un repository git
2. 📥 Récupère les changements stagés  
3. 🤖 Envoie les changements à GPT-4o avec un prompt optimisé
4. 📝 Affiche le message de commit proposé
5. ❓ Demande confirmation (y/n)
6. 🚀 Effectue le commit si confirmé

### Exemple d'utilisation

```bash
$ git add package.json bin/tera.js
$ tera commit

📥 Récupération des changements stagés...
✅ Changements trouvés dans 2 fichier(s):
   - package.json
   - bin/tera.js

⠋ Génération du message de commit avec GPT-4o...
✅ Message de commit généré

 MESSAGE DE COMMIT PROPOSÉ 
┌──────────────────────────────────────────────────┐
│ feat(cli): ajoute l'assistant CLI tera avec GPT-4o│
│                                                  │
│ - Ajoute le script principal CLI avec commander │
│ - Configure l'intégration OpenAI GPT-4o         │
│ - Implémente la commande commit intelligente    │
└──────────────────────────────────────────────────┘

Voulez-vous commiter avec ce message ? (y/n) y

🚀 Commit en cours...
✅ Commit effectué avec succès !
```

## ⚙️ Configuration

### Variables d'environnement

- `OPENAI_API_KEY` (requis) : Votre clé API OpenAI

### Obtenir une clé API OpenAI

1. Allez sur [platform.openai.com](https://platform.openai.com)
2. Créez un compte ou connectez-vous
3. Naviguez vers "API Keys" 
4. Créez une nouvelle clé API
5. Exportez-la dans votre shell :

```bash
# Temporaire (session actuelle)
export OPENAI_API_KEY="sk-..."

# Permanent (ajoutez à votre ~/.bashrc, ~/.zshrc, etc.)
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.bashrc
```

## 🛠️ Développement

### Structure du projet

```
tera/
├── bin/
│   └── tera.js           # Point d'entrée CLI
├── lib/
│   ├── commands/
│   │   └── commit.js     # Commande commit
│   └── utils/
│       ├── git.js        # Utilitaires git
│       ├── openai.js     # Intégration OpenAI
│       └── prompt.js     # Confirmations utilisateur
├── package.json
└── README.md
```

### Ajout de nouvelles commandes

1. Créez un nouveau fichier dans `lib/commands/`
2. Exportez une fonction async
3. Ajoutez la commande dans `bin/tera.js`

## 🐛 Dépannage

### Erreur "OPENAI_API_KEY est requise"
- Vérifiez que vous avez exporté votre clé API OpenAI
- Vérifiez la validité de votre clé

### Erreur "Aucun changement stagé trouvé"
- Utilisez `git add <fichiers>` avant `tera commit`
- Vérifiez avec `git status` que vous avez des changements stagés

### Erreur "Vous n'êtes pas dans un repository git"
- Assurez-vous d'être dans un dossier git (`git init` si nécessaire)

## 📝 License

ISC 