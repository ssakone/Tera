import OpenAI from 'openai';
import chalk from 'chalk';
import { getActiveConfig, PROVIDERS } from './config.js';

let openaiClient = null;

/**
 * Initialise le client OpenAI/OpenRouter
 */
function getOpenAIClient() {
  if (!openaiClient) {
    const activeConfig = getActiveConfig();
    
    if (!activeConfig.apiKey) {
      throw new Error('Clé API non configurée');
    }
    
    const clientConfig = {
      apiKey: activeConfig.apiKey
    };
    
    // Ajouter l'URL de base pour OpenRouter
    if (activeConfig.provider === PROVIDERS.OPENROUTER) {
      clientConfig.baseURL = activeConfig.baseURL;
    }
    
    openaiClient = new OpenAI(clientConfig);
  }
  return openaiClient;
}

/**
 * Réinitialise le client (utile lors du changement de configuration)
 */
export function resetClient() {
  openaiClient = null;
}

/**
 * Prompt système pour générer les messages de commit
 */
const COMMIT_SYSTEM_PROMPT = `Tu es un expert en messages de commit Git. Ta tâche est de générer un message de commit clair, concis et descriptif basé sur les changements fournis.

Règles pour le message de commit:
1. Utilise le format conventionnel: <type>(<scope>): <description>
2. Types acceptés: feat, fix, docs, style, refactor, test, chore, ci, build, perf
3. Le scope est optionnel mais recommandé
4. La description doit être en français, au présent, et commencer par un verbe
5. Maximum 50 caractères pour la première ligne
6. Si nécessaire, ajoute une description plus détaillée après une ligne vide
7. Sois précis sur ce qui a été modifié/ajouté/supprimé

Exemples:
- feat(auth): ajoute l'authentification OAuth
- fix(api): corrige la validation des données utilisateur
- refactor(utils): simplifie la logique de formatage
- docs(readme): met à jour les instructions d'installation

Génère uniquement le message de commit, sans explication supplémentaire.`;

/**
 * Prompt système pour modifier les fichiers
 */
const CODE_MODIFICATION_SYSTEM_PROMPT = `Tu es un expert développeur qui aide à modifier du code selon les besoins spécifiés par l'utilisateur.

RÈGLES IMPORTANTES:
1. Tu dois retourner UNIQUEMENT le code modifié complet, sans explication
2. Conserve exactement la même structure et indentation que le fichier original
3. Ne modifie que ce qui est nécessaire pour répondre à la demande
4. Respecte le style de code existant
5. Assure-toi que le code reste fonctionnel
6. Si tu ajoutes des imports, place-les au bon endroit
7. Préserve tous les commentaires existants sauf si explicitement demandé de les modifier
8. Ne retourne PAS de markdown, de triple backticks, ou d'explications

IMPORTANT: Ta réponse doit être le contenu exact du fichier modifié, prêt à être sauvegardé directement.`;

/**
 * Génère un message de commit en utilisant l'IA
 */
export async function generateCommitMessage(diff, files) {
  try {
    const client = getOpenAIClient();
    const activeConfig = getActiveConfig();
    
    const userPrompt = `Fichiers modifiés: ${files.join(', ')}

Changements:
\`\`\`diff
${diff}
\`\`\``;

    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: COMMIT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    const message = response.choices[0]?.message?.content?.trim();
    if (!message) {
      throw new Error('Aucun message généré par l\'IA');
    }

    return message;
  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Clé API invalide. Vérifiez votre configuration avec "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Quota insuffisant. Vérifiez votre compte');
    } else if (error.message.includes('non configurée')) {
      throw new Error('Clé API non configurée. Utilisez "tera config" pour la configurer');
    } else if (error.status === 401) {
      throw new Error('Clé API invalide ou expirée. Vérifiez votre configuration avec "tera config"');
    } else if (error.status === 429) {
      throw new Error('Limite de requêtes atteinte. Attendez un moment avant de réessayer');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Modèle "${activeConfig.model}" non trouvé. Vérifiez votre configuration avec "tera config"`);
    } else {
      throw new Error(`Erreur IA: ${error.message}`);
    }
  }
}

/**
 * Génère des modifications de code en utilisant l'IA
 */
export async function generateCodeModification(fileContent, filePath, userNeed) {
  try {
    const client = getOpenAIClient();
    const activeConfig = getActiveConfig();
    
    const userPrompt = `Fichier: ${filePath}

Contenu actuel:
\`\`\`
${fileContent}
\`\`\`

Modification demandée: ${userNeed}

Retourne le code modifié complet.`;

    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: CODE_MODIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 4000,
      temperature: 0.2
    });

    const modifiedContent = response.choices[0]?.message?.content?.trim();
    if (!modifiedContent) {
      throw new Error('Aucune modification générée par l\'IA');
    }

    // Nettoyer la réponse si elle contient des markdown blocks
    let cleanedContent = modifiedContent;
    
    // Retirer les triple backticks si présents
    if (cleanedContent.startsWith('```')) {
      const lines = cleanedContent.split('\n');
      lines.shift(); // Retirer la première ligne (```)
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop(); // Retirer la dernière ligne (```)
      }
      cleanedContent = lines.join('\n');
    }

    return cleanedContent;
  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Clé API invalide. Vérifiez votre configuration avec "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Quota insuffisant. Vérifiez votre compte');
    } else if (error.message.includes('non configurée')) {
      throw new Error('Clé API non configurée. Utilisez "tera config" pour la configurer');
    } else if (error.status === 401) {
      throw new Error('Clé API invalide ou expirée. Vérifiez votre configuration avec "tera config"');
    } else if (error.status === 429) {
      throw new Error('Limite de requêtes atteinte. Attendez un moment avant de réessayer');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Modèle "${activeConfig.model}" non trouvé. Vérifiez votre configuration avec "tera config"`);
    } else {
      throw new Error(`Erreur IA: ${error.message}`);
    }
  }
}

/**
 * Prompt système pour l'analyse de code et détection de bugs
 */
const CODE_REVIEW_SYSTEM_PROMPT = `Tu es un expert développeur senior qui fait des revues de code pour détecter les bugs, problèmes de sécurité, et suggérer des améliorations.

ANALYSE À EFFECTUER:
1. Détection de bugs potentiels (erreurs logiques, conditions manquantes, null/undefined)
2. Problèmes de sécurité (injections, validation manquante, données sensibles)
3. Problèmes de performance (boucles inefficaces, opérations coûteuses)
4. Bonnes pratiques (nomenclature, structure, lisibilité)
5. Gestion d'erreurs manquante ou insuffisante

FORMAT DE RÉPONSE:
Réponds en JSON avec cette structure exacte:
{
  "summary": "Résumé global des problèmes trouvés",
  "issues": [
    {
      "type": "bug|security|performance|style|error-handling",
      "severity": "critical|high|medium|low",
      "title": "Titre court du problème",
      "description": "Description détaillée du problème",
      "suggestion": "Suggestion de correction",
      "file": "nom du fichier concerné (OBLIGATOIRE)",
      "line": "numéro de ligne approximatif (optionnel)",
      "code_example": "exemple de code corrigé (optionnel)"
    }
  ],
  "recommendations": [
    "Recommandation générale 1",
    "Recommandation générale 2"
  ]
}

IMPORTANT: 
- Sois précis et constructif
- Concentre-toi sur les vrais problèmes, pas les préférences de style mineures
- Fournis des suggestions concrètes et réalisables
- OBLIGATOIRE: Pour chaque problème, indique TOUJOURS le fichier concerné dans le champ "file"
- Si aucun problème n'est trouvé, retourne un tableau "issues" vide`;

/**
 * Analyse le code pour détecter les bugs et problèmes (fichier unique)
 */
export async function analyzeCode(codeContent, filePath, commitInfo = null) {
  return await analyzeCodeBatch([{ content: codeContent, path: filePath }], commitInfo);
}

/**
 * Analyse plusieurs fichiers ensemble pour détecter les bugs et problèmes
 */
export async function analyzeCodeBatch(files, commitInfo = null) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  let userPrompt = `Analyse ces fichiers pour détecter les bugs et problèmes potentiels:`;

  if (commitInfo) {
    userPrompt += `

COMMIT: ${commitInfo.short} - ${commitInfo.subject}
AUTEUR: ${commitInfo.author}`;
  }

  userPrompt += `

FICHIERS À ANALYSER:`;

  // Ajouter chaque fichier
  files.forEach((file, index) => {
    userPrompt += `

=== FICHIER ${index + 1}: ${file.path} ===
\`\`\`
${file.content}
\`\`\``;
  });

  userPrompt += `

INSTRUCTIONS SPÉCIALES:
- Analyse chaque fichier individuellement ET les relations entre eux
- Détecte les problèmes qui peuvent affecter plusieurs fichiers
- Pour chaque problème, indique clairement le fichier concerné
- Groupe les recommandations qui s'appliquent à plusieurs fichiers`;

  try {
    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: CODE_REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000 // Augmenté pour les analyses de lots
    });

    const content = response.choices[0].message.content.trim();
    
    try {
      return JSON.parse(content);
    } catch (parseError) {
      // Si le JSON est malformé, retourner une structure de base
      return {
        summary: "Erreur lors de l'analyse: réponse malformée",
        issues: [],
        recommendations: ["Réessayez l'analyse"]
      };
    }

  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Clé API invalide. Vérifiez votre configuration avec "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Quota insuffisant. Vérifiez votre compte');
    } else if (error.message.includes('non configurée')) {
      throw new Error('Clé API non configurée. Utilisez "tera config" pour la configurer');
    } else if (error.status === 401) {
      throw new Error('Clé API invalide ou expirée. Vérifiez votre configuration avec "tera config"');
    } else if (error.status === 429) {
      throw new Error('Limite de requêtes atteinte. Attendez un moment avant de réessayer');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Modèle "${activeConfig.model}" non trouvé. Vérifiez votre configuration avec "tera config"`);
    } else {
      throw new Error(`Erreur IA: ${error.message}`);
    }
  }
}

/**
 * Analyse l'environnement du projet
 */
async function analyzeProjectEnvironment() {
  const { execSync } = await import('child_process');
  const { readdirSync, statSync, readFileSync, existsSync } = await import('fs');
  const { join, extname } = await import('path');
  
  const analysis = {
    directory: process.cwd(),
    structure: {},
    packageInfo: null,
    gitInfo: null,
    technologies: [],
    keyFiles: {}
  };

  try {
    // Analyser la structure des dossiers (2 niveaux max)
    function scanDirectory(dirPath, depth = 0, maxDepth = 2) {
      if (depth > maxDepth) return {};
      
      const items = {};
      try {
        const entries = readdirSync(dirPath);
        
        for (const entry of entries) {
          if (entry.startsWith('.') && !['package.json', '.gitignore', '.env'].includes(entry)) continue;
          
          const fullPath = join(dirPath, entry);
          const stat = statSync(fullPath);
          
          if (stat.isDirectory()) {
            items[entry] = {
              type: 'directory',
              children: scanDirectory(fullPath, depth + 1, maxDepth)
            };
          } else {
            items[entry] = {
              type: 'file',
              size: stat.size,
              extension: extname(entry)
            };
          }
        }
      } catch (error) {
        // Dossier non accessible
      }
      
      return items;
    }

    analysis.structure = scanDirectory(process.cwd());

    // Lire les fichiers clés
    const keyFiles = [
      'package.json', 'composer.json', 'requirements.txt', 'Gemfile', 
      'Cargo.toml', 'go.mod', 'pubspec.yaml', 'pom.xml', 'build.gradle',
      'README.md', 'README.txt', '.gitignore', 'tsconfig.json', 
      'webpack.config.js', 'vite.config.js', 'next.config.js'
    ];

    for (const fileName of keyFiles) {
      if (existsSync(fileName)) {
        try {
          const content = readFileSync(fileName, 'utf8');
          analysis.keyFiles[fileName] = content.length > 2000 ? 
            content.substring(0, 2000) + '...[tronqué]' : content;
          
          // Extraire les infos du package.json
          if (fileName === 'package.json') {
            try {
              analysis.packageInfo = JSON.parse(content);
            } catch {}
          }
        } catch (error) {
          analysis.keyFiles[fileName] = `[Erreur de lecture: ${error.message}]`;
        }
      }
    }

    // Détecter les technologies
    if (analysis.packageInfo) {
      const deps = { ...analysis.packageInfo.dependencies, ...analysis.packageInfo.devDependencies };
      if (deps.react) analysis.technologies.push('React');
      if (deps.vue) analysis.technologies.push('Vue.js');
      if (deps.angular) analysis.technologies.push('Angular');
      if (deps.express) analysis.technologies.push('Express');
      if (deps.typescript) analysis.technologies.push('TypeScript');
      if (deps.tailwindcss) analysis.technologies.push('Tailwind CSS');
      if (deps.next) analysis.technologies.push('Next.js');
      if (deps.vite) analysis.technologies.push('Vite');
    }

    // Info Git
    try {
      const gitStatus = execSync('git status --porcelain', { encoding: 'utf8', stdio: 'pipe' });
      const gitBranch = execSync('git branch --show-current', { encoding: 'utf8', stdio: 'pipe' }).trim();
      analysis.gitInfo = {
        isRepo: true,
        branch: gitBranch,
        hasChanges: gitStatus.trim().length > 0,
        status: gitStatus
      };
    } catch {
      analysis.gitInfo = { isRepo: false };
    }

  } catch (error) {
    console.warn(`Erreur lors de l'analyse de l'environnement: ${error.message}`);
  }

  return analysis;
}

/**
 * Génère un plan d'actions en mode découverte interactive
 */
export async function generateActionPlan(task, discoveryCallback, onToken = null) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  const systemPrompt = `Tu es un agent IA autonome expert en développement. Tu as le contrôle total sur l'accomplissement de la tâche.

PRINCIPE FONDAMENTAL:
- TU DÉCIDES quand la tâche est terminée ou si tu dois continuer
- Tu peux générer plusieurs plans successifs jusqu'à accomplissement complet
- Ne t'arrête QUE quand tu es absolument sûr que la tâche est entièrement terminée

PROCESSUS OBLIGATOIRE:
1. Tu DOIS découvrir ton environnement étape par étape (première fois)
2. Tu DOIS demander explicitement à lire le répertoire d'abord
3. Tu DOIS demander à lire des fichiers spécifiques si nécessaire
4. Tu élabores ton plan pour cette itération
5. Après exécution, tu ÉVALUES et DÉCIDES si tu continues

ACTIONS DE DÉCOUVERTE:
- list_directory: Lister le contenu d'un répertoire
- analyze_file: Lire et analyser un fichier existant

ACTIONS D'EXÉCUTION (avec paramètres requis):
- create_file: {"path": "fichier.ext", "content": "contenu complet"}
- modify_file: {"path": "fichier.ext", "content": "nouveau contenu"}  
- run_command: {"command": "commande shell", "cwd": "."}
- install_package: {"package": "nom-package"}
- create_directory: {"path": "chemin/dossier"}
- git_commit: {"message": "message commit"}

RÈGLES CRITIQUES:
1. COMMENCE par découverte si première itération
2. Adapte ton plan selon ce que tu découvres
3. Génère des plans par étapes logiques (ne tout faire d'un coup)
4. DÉCIDE toujours si tu continues ou arrêtes après chaque plan`;

  // Phase 1: Découverte de l'environnement
  let discoverySteps = [
    {
      action: 'list_directory',
      description: 'Explorer la structure du répertoire',
      params: { path: '.' }
    }
  ];

  // Exécuter la découverte
  const discoveryResults = {};
  
  for (const step of discoverySteps) {
    const result = await discoveryCallback(step);
    discoveryResults[step.action] = result;
    
    // L'IA peut demander plus de découvertes basées sur ce qu'elle a trouvé
    if (step.action === 'list_directory' && result) {
      // Identifier les fichiers clés à analyser
      const keyFiles = [];
      const files = result.split('\n').filter(f => f.trim());
      
      for (const file of files) {
        if (['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pubspec.yaml', 'README.md'].includes(file.trim())) {
          keyFiles.push({
            action: 'analyze_file',
            description: `Analyser ${file.trim()}`,
            params: { path: file.trim() }
          });
        }
      }
      
      // Analyser les fichiers clés
      for (const fileStep of keyFiles.slice(0, 3)) { // Limiter à 3 fichiers max
        const fileResult = await discoveryCallback(fileStep);
        discoveryResults[fileStep.params.path] = fileResult;
      }
    }
  }

  // Phase 2: Génération du plan basé sur la découverte
  const userPrompt = `Génère un plan d'actions pour: "${task}"

DÉCOUVERTES EFFECTUÉES:
${JSON.stringify(discoveryResults, null, 2)}

Répertoire de travail: ${process.cwd()}

Maintenant que tu as exploré l'environnement, propose un plan d'actions adapté.

Format attendu (réponds en JSON):
{
  "analysis": "ton analyse de l'environnement ou de la situation actuelle",
  "strategy": "ta stratégie pour cette itération", 
  "status": "continue|complete",
  "reasoning": "pourquoi tu continues ou considères la tâche terminée",
  "actions": [
    {
      "action": "create_file|modify_file|run_command|install_package|create_directory|git_commit",
      "description": "Description lisible de l'action",
      "params": { /* voir exemples ci-dessous */ }
    }
  ]
}

EXEMPLES DE PARAMÈTRES OBLIGATOIRES:
create_file: {"path": "README.md", "content": "# Mon Projet\n\nDescription du projet..."}
modify_file: {"path": "config.py", "content": "# Configuration\nDEBUG = True\n"}
run_command: {"command": "pip install -r requirements.txt", "cwd": "."}
install_package: {"package": "flask"}
create_directory: {"path": "src/modules"}
git_commit: {"message": "Initial project setup"}

STATUTS OBLIGATOIRES:
- "continue": Tu as encore du travail à faire après ce plan (défaut)  
- "complete": La tâche est entièrement terminée et fonctionnelle

RÈGLE CRITIQUE: TOUJOURS inclure TOUS les paramètres requis dans "params"`;

  try {
    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      stream: !!onToken
    });

    // Mode normal (plus de streaming pour éviter les conflits d'affichage)
    const content = response.choices[0].message.content.trim();
    
    try {
      const parsed = JSON.parse(content);
      return { plan: parsed, discoveries: discoveryResults };
    } catch (parseError) {
      // Essayer de nettoyer le JSON si il y a des caractères en trop
      let cleanContent = content;
      
      // Chercher le JSON dans la réponse
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
        try {
          const parsed = JSON.parse(cleanContent);
          return { plan: parsed, discoveries: discoveryResults };
        } catch (secondParseError) {
          // Échec même après nettoyage
        }
      }
      
      return { 
        plan: {
          analysis: "Erreur de parsing du plan",
          strategy: "Erreur de parsing du plan", 
          actions: []
        }, 
        discoveries: discoveryResults 
      };
    }

  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Clé API invalide. Vérifiez votre configuration avec "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Quota insuffisant. Vérifiez votre compte');
    } else if (error.message.includes('non configurée')) {
      throw new Error('Clé API non configurée. Utilisez "tera config" pour la configurer');
    } else if (error.status === 401) {
      throw new Error('Clé API invalide ou expirée. Vérifiez votre configuration avec "tera config"');
    } else if (error.status === 429) {
      throw new Error('Limite de requêtes atteinte. Attendez un moment avant de réessayer');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Modèle "${activeConfig.model}" non trouvé. Vérifiez votre configuration avec "tera config"`);
    } else {
      throw new Error(`Erreur IA: ${error.message}`);
    }
  }
}

/**
 * Évalue le résultat d'exécution et génère le prochain plan si nécessaire
 */
export async function evaluateAndContinue(task, executionResults, previousPlans = []) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  const systemPrompt = `Tu es un agent IA autonome expert en développement. Tu viens d'exécuter un plan d'actions.

MISSION: Évaluer les résultats et décider si tu dois continuer ou si la tâche est terminée.

TU AS LE CONTRÔLE TOTAL:
- TU DÉCIDES si la tâche est complète ou si tu dois continuer
- TU peux générer un nouveau plan pour les prochaines étapes
- TU évalues la qualité et la complétude du travail accompli

CRITÈRES D'ÉVALUATION:
1. La tâche originale est-elle complètement accomplie ?
2. Le résultat est-il fonctionnel et de qualité ?
3. Y a-t-il des éléments manquants ou des améliorations nécessaires ?
4. Les bonnes pratiques sont-elles respectées ?

ACTIONS DISPONIBLES (avec paramètres requis):
- create_file: {"path": "fichier.ext", "content": "contenu complet"}
- modify_file: {"path": "fichier.ext", "content": "nouveau contenu"}  
- run_command: {"command": "commande shell", "cwd": "."}
- install_package: {"package": "nom-package"}
- create_directory: {"path": "chemin/dossier"}
- git_commit: {"message": "message commit"}
- analyze_file: {"path": "chemin/fichier"}
- list_directory: {"path": "chemin/repertoire"}`;

  const userPrompt = `TÂCHE ORIGINALE: "${task}"

RÉSULTATS D'EXÉCUTION DU DERNIER PLAN:
${JSON.stringify(executionResults, null, 2)}

PLANS PRÉCÉDENTS EXÉCUTÉS:
${previousPlans.map((plan, index) => `Plan ${index + 1}: ${plan.strategy}`).join('\n')}

Répertoire de travail: ${process.cwd()}

Évalue maintenant la situation et décide si tu continues ou si c'est terminé.

Format attendu (réponds en JSON):
{
  "analysis": "ton évaluation de ce qui a été accompli et de l'état actuel",
  "strategy": "ta stratégie pour la suite (si tu continues)", 
  "status": "continue|complete",
  "reasoning": "explication détaillée de ta décision",
  "actions": [
    {
      "action": "create_file|modify_file|run_command|install_package|create_directory|git_commit|analyze_file|list_directory",
      "description": "Description lisible de l'action", 
      "params": { /* voir exemples ci-dessous */ }
    }
  ]
}

EXEMPLES DE PARAMÈTRES OBLIGATOIRES:
create_file: {"path": "README.md", "content": "# Mon Projet\n\nDescription du projet..."}
modify_file: {"path": "config.py", "content": "# Configuration\nDEBUG = True\n"}
run_command: {"command": "pip install -r requirements.txt", "cwd": "."}
install_package: {"package": "flask"}
create_directory: {"path": "src/modules"}
git_commit: {"message": "Initial project setup"}
analyze_file: {"path": "requirements.txt"}
list_directory: {"path": "."}

STATUTS OBLIGATOIRES:
- "continue": Tu as encore du travail à faire (génère des actions)
- "complete": La tâche est entièrement terminée et fonctionnelle (actions peut être vide)

RÈGLE CRITIQUE: TOUJOURS inclure TOUS les paramètres requis dans "params"`;

  try {
    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content.trim();
    
    try {
      const parsed = JSON.parse(content);
      return { plan: parsed };
    } catch (parseError) {
      // Essayer de nettoyer le JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return { plan: parsed };
        } catch (secondParseError) {
          // Échec même après nettoyage
        }
      }
      
      return { 
        plan: {
          analysis: "Erreur de parsing de l'évaluation",
          strategy: "Erreur de parsing", 
          status: "complete",
          reasoning: "Erreur technique, arrêt par sécurité",
          actions: []
        }
      };
    }

  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Clé API invalide. Vérifiez votre configuration avec "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Quota insuffisant. Vérifiez votre compte');
    } else if (error.message.includes('non configurée')) {
      throw new Error('Clé API non configurée. Utilisez "tera config" pour la configurer');
    } else if (error.status === 401) {
      throw new Error('Clé API invalide ou expirée. Vérifiez votre configuration avec "tera config"');
    } else if (error.status === 429) {
      throw new Error('Limite de requêtes atteinte. Attendez un moment avant de réessayer');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Modèle "${activeConfig.model}" non trouvé. Vérifiez votre configuration avec "tera config"`);
    } else {
      throw new Error(`Erreur IA: ${error.message}`);
    }
  }
}

/**
 * Obtient des informations sur la configuration active
 */
export function getAIInfo() {
  const activeConfig = getActiveConfig();
  
  return {
    provider: activeConfig.provider,
    model: activeConfig.model,
    hasApiKey: !!activeConfig.apiKey,
    baseURL: activeConfig.baseURL
  };
} 