# Tera - Assistant CLI avec GPT-4o

Assistant CLI intelligent qui utilise GPT-4o pour automatiser les tâches de développement.

## 🚀 Installation

1. **Installer les dépendances :**
```bash
npm install
```

2. **Installer globalement :**
```bash
npm run install-global
# ou
npm link
```

3. **Configurer votre clé API OpenAI (optionnel) :**
```bash
export OPENAI_API_KEY="your-openai-api-key-here"
# ou utilisez "tera config" lors de la première utilisation
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

### Commande `change`

Modifie intelligemment un fichier selon vos besoins avec GPT-4o :

```bash
tera change <file_path> "<description_du_besoin>"
```

**Exemples :**
```bash
# Ajouter une fonction
tera change app.js "ajouter une fonction pour calculer la moyenne"

# Refactoriser du code
tera change utils.js "convertir les fonctions en classes ES6"

# Ajouter des commentaires
tera change main.py "ajouter des docstrings à toutes les fonctions"

# Corriger un problème
tera change config.json "ajouter le support pour l'environnement de test"
```

**Options disponibles :**
- `--no-backup` : Ne pas créer de sauvegarde automatique
- `-p, --preview` : Affiche un aperçu du contenu modifié après application

**Ce que fait la commande :**
1. 📁 Vérifie que le fichier existe
2. 📖 Lit le contenu actuel
3. 🤖 Envoie le contenu + votre demande à GPT-4o
4. 🎨 Affiche un diff coloré des modifications proposées
5. 📊 Montre un résumé des changements
6. ❓ Demande confirmation (y/n)
7. 💾 Crée une sauvegarde (sauf si --no-backup)
8. ✏️ Applique les modifications si confirmé

### Commande `config`

Gère la configuration de Tera :

```bash
# Configurer/reconfigurer la clé API OpenAI
tera config

# Afficher la configuration actuelle
tera config --show
```

## 🌟 Exemples d'utilisation

### Exemple complet avec `commit`

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

### Exemple avec `change`

```bash
$ tera change app.js "ajouter une fonction de validation email"

📁 Modification de: app.js
   Chemin: /path/to/app.js
   Taille: 1250 octets

📖 Lecture du fichier...

🎯 Modification demandée:
"ajouter une fonction de validation email"

⠋ Génération des modifications avec GPT-4o...
✅ Modifications générées

 MODIFICATIONS PROPOSÉES POUR app.js 
────────────────────────────────────────────────────────────────────────────────
  15 │ 
  16 │ // Existing functions...
  17 │ 
+ 18 │ /**
+ 19 │  * Valide une adresse email
+ 20 │  * @param {string} email - L'adresse email à valider
+ 21 │  * @returns {boolean} - True si l'email est valide
+ 22 │  */
+ 23 │ function validateEmail(email) {
+ 24 │   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
+ 25 │   return emailRegex.test(email);
+ 26 │ }
+ 27 │ 
  28 │ module.exports = {
- 29 │   // existing exports
+ 29 │   // existing exports
+ 30 │   validateEmail
  31 │ };
────────────────────────────────────────────────────────────────────────────────

📊 Résumé des changements:
  + 8 ligne(s) ajoutée(s)
  ~ 1 ligne(s) modifiée(s)
  📏 Total: 25 → 33 lignes

Voulez-vous appliquer ces modifications ? (y/n) y

💾 Création d'une sauvegarde...
✅ Sauvegarde créée: app.js.backup-2024-01-15T10-30-45-123Z
✏️  Application des modifications...
✅ Fichier modifié avec succès !
📈 Taille: +285 octets
```

## ⚙️ Configuration

### Variables d'environnement

- `OPENAI_API_KEY` (optionnel) : Votre clé API OpenAI

### Configuration automatique

Lors de la première utilisation, Tera vous demandera automatiquement votre clé API OpenAI et la sauvegardera de manière sécurisée dans `~/.tera-config.json`.

### Obtenir une clé API OpenAI

1. Allez sur [platform.openai.com](https://platform.openai.com)
2. Créez un compte ou connectez-vous
3. Naviguez vers "API Keys" 
4. Créez une nouvelle clé API
5. Utilisez `tera config` pour la configurer

## 🛠️ Développement

### Structure du projet

```
tera/
├── bin/
│   └── tera.js           # Point d'entrée CLI
├── lib/
│   ├── commands/
│   │   ├── commit.js     # Commande commit
│   │   ├── config.js     # Commande config
│   │   └── change.js     # Commande change
│   └── utils/
│       ├── git.js        # Utilitaires git
│       ├── openai.js     # Intégration OpenAI
│       ├── prompt.js     # Confirmations utilisateur
│       ├── config.js     # Gestion configuration
│       ├── file.js       # Gestion fichiers
│       └── diff.js       # Affichage diffs colorés
├── package.json
└── README.md
```

### Ajout de nouvelles commandes

1. Créez un nouveau fichier dans `lib/commands/`
2. Exportez une fonction async
3. Ajoutez la commande dans `bin/tera.js`

## 🐛 Dépannage

### Erreur "OPENAI_API_KEY non configurée"
- Utilisez `tera config` pour configurer votre clé API
- Ou exportez la variable d'environnement `OPENAI_API_KEY`

### Erreur "Aucun changement stagé trouvé"
- Utilisez `git add <fichiers>` avant `tera commit`
- Vérifiez avec `git status` que vous avez des changements stagés

### Erreur "Le fichier n'existe pas"
- Vérifiez le chemin du fichier pour `tera change`
- Utilisez des chemins relatifs ou absolus

### Problèmes de sauvegarde
- Les sauvegardes sont créées automatiquement avec un timestamp
- Utilisez `--no-backup` pour désactiver les sauvegardes
- Les sauvegardes sont exclues du git (voir .gitignore)

## 📝 License

ISC 