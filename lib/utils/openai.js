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
RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN:
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
 * Valide que le plan n'utilise que des chemins découverts
 */
function validatePlanPaths(plan, discoveryResults, foundFilePaths) {
  if (!plan.actions || !Array.isArray(plan.actions)) {
    return { valid: true };
  }
  
  // Construire la liste complète des chemins valides
  const validPaths = new Set([...foundFilePaths]);
  
  // Ajouter les chemins de la recherche récursive
  if (discoveryResults.file_search) {
    const searchPaths = discoveryResults.file_search.split('\n')
      .map(f => f.trim().replace(/^\.\//, ''))
      .filter(f => f);
    searchPaths.forEach(path => validPaths.add(path));
  }
  
  // Ajouter les chemins des listings de dossiers (pour les actions list_directory)
  if (discoveryResults.list_directory) {
    validPaths.add('.');
    validPaths.add('src');
    validPaths.add('public');
    validPaths.add('components');
    validPaths.add('src/components');
  }
  
  const invalidPaths = [];
  
  // Vérifier chaque action
  for (const action of plan.actions) {
    if (action.params && action.params.path) {
      const actionPath = action.params.path;
      
      // Ignorer les actions de création qui peuvent créer de nouveaux fichiers
      if (action.action === 'create_file' || action.action === 'create_directory') {
        continue;
      }
      
      // Pour les autres actions, le chemin doit exister dans les découvertes
      if (!validPaths.has(actionPath)) {
        // Vérifier aussi si c'est un chemin partiel valide
        const isPartialValid = Array.from(validPaths).some(validPath => 
          validPath.includes(actionPath) || actionPath.includes(validPath)
        );
        
        if (!isPartialValid) {
          invalidPaths.push(actionPath);
        }
      }
    }
  }
  
  if (invalidPaths.length > 0) {
    return {
      valid: false,
      error: `Chemins inventés détectés`,
      invalidPaths,
      validPaths: Array.from(validPaths)
    };
  }
  
  return { valid: true };
}

/**
 * Corrige automatiquement un plan avec des chemins inventés
 */
function generateCorrectedPlanPaths(plan, discoveryResults, foundFilePaths) {
  if (!plan.actions || !Array.isArray(plan.actions)) {
    return plan;
  }
  
  // Construire la liste des chemins valides avec recherche
  const validPaths = [...foundFilePaths];
  if (discoveryResults.file_search) {
    const searchPaths = discoveryResults.file_search.split('\n')
      .map(f => f.trim().replace(/^\.\//, ''))
      .filter(f => f);
    validPaths.push(...searchPaths);
  }
  
  const correctedPlan = { ...plan };
  correctedPlan.actions = [];
  
  // Si aucun fichier valide n'a été trouvé, créer une action de recherche
  if (validPaths.length === 0) {
    correctedPlan.analysis = "Aucun fichier pertinent trouvé dans les découvertes";
    correctedPlan.actions.push({
      action: 'run_command',
      description: 'Rechercher les fichiers testimonial dans le projet',
      params: {
        command: 'find . -name "*testimonial*" -type f 2>/dev/null | head -10',
        cwd: '.'
      }
    });
  } else {
    // Utiliser le premier fichier valide trouvé
    correctedPlan.analysis = `Fichier testimonial trouvé: ${validPaths[0]}`;
    correctedPlan.actions.push({
      action: 'analyze_file',
      description: `Analyser le fichier testimonial trouvé: ${validPaths[0]}`,
      params: {
        path: validPaths[0]
      }
    });
  }
  
  return correctedPlan;
}

/**
 * Génère un plan d'actions en mode découverte interactive
 */
export async function generateActionPlan(task, discoveryCallback, onToken = null, memoryContext = null) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  let systemPrompt = `Tu es un agent IA autonome expert en développement, capable de résoudre des problèmes techniques complexes de manière méthodique et efficace.

<identity>
Tu es un développeur senior expérimenté avec une expertise approfondie en:
- Résolution de bugs et erreurs de compilation
- Analyse de code et détection de problèmes
- Correction d'erreurs d'indentation et de syntaxe
- Utilisation efficace des outils de développement
</identity>

<core_process>
1. ANALYSER la tâche et identifier les fichiers/chemins spécifiques mentionnés
2. UTILISER les DÉCOUVERTES pour comprendre la structure réelle du projet (ne pas faire d'hypothèses)
3. UTILISER les chemins COMPLETS fournis dans les messages d'erreur (ex: "/Users/.../file.py")
4. APPLIQUER les actions concrètes pour résoudre le problème basées sur la structure découverte
5. VÉRIFIER les résultats et corriger si nécessaire
</core_process>

<available_actions>
- list_directory: {"path": "."} - Lister le contenu d'un répertoire
- analyze_file: {"path": "chemin/complet/fichier.ext"} - Lire un fichier (utilise le CHEMIN COMPLET si fourni)
- analyze_file: {"path": "fichier.ext", "startLine": 1, "endLine": 50} - Lire avec plage de lignes LARGE (minimum 50 lignes)
- create_file: {"path": "fichier.ext", "content": "contenu complet"} - Créer un nouveau fichier
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "texte exact", "new": "nouveau texte"}]} - Modifier un fichier
- run_command: {"command": "commande shell", "cwd": "."} - Exécuter une commande système
</available_actions>

<critical_rules>
1. 🎯 PRIORITÉ ABSOLUE: Si un message d'erreur contient un chemin complet (ex: File "/Users/enokas/tmp/http_handler/http_server.py"), utilise ce chemin EXACT - ne cherche pas ailleurs
2. 🗂️  UTILISER LES DÉCOUVERTES: Base tes actions sur la structure découverte, ne suppose JAMAIS l'existence de dossiers comme "src/components/" sans l'avoir vérifié
3. 📁 CHEMINS EXACTS UNIQUEMENT: Utilise EXCLUSIVEMENT les chemins de fichiers qui sont listés dans les découvertes. Ne reconstitue JAMAIS un chemin de toutes pièces
4. 📋 AVANT patch_file: TOUJOURS faire analyze_file pour connaître le contenu exact de la ligne
5. 📐 Pour erreurs de ligne spécifique: utilise analyze_file avec LARGE contexte (minimum 50 lignes autour de l'erreur)
6. ❌ JAMAIS de patch_file avec des changements vides ou approximatifs
7. 🔄 ÉVITER les boucles: ne pas répéter list_directory si un fichier spécifique est mentionné
8. 🎯 EFFICACITÉ: Si la tâche mentionne un fichier précis, l'analyser directement sans listing général
9. 🔍 RECHERCHE INTELLIGENTE: Si les mots-clés de la tâche ne correspondent à aucun fichier évident, utilise la recherche récursive fournie dans les découvertes
</critical_rules>

<error_handling_expertise>
- IndentationError: Toujours analyser au moins 50 lignes autour de l'erreur pour voir la structure complète
- File not found: Utiliser le chemin COMPLET de l'erreur, pas juste le nom du fichier
- Syntax errors: Analyser le contexte large pour comprendre la structure du code
</error_handling_expertise>`;

  // Ajouter le contexte de mémoire si disponible
  if (memoryContext && memoryContext.hasContext) {
    systemPrompt += `

🧠 MÉMOIRE PERSISTANTE DISPONIBLE:

${memoryContext.similarEpisodes.length > 0 ? `ÉPISODES SIMILAIRES PASSÉS:
${memoryContext.similarEpisodes.map(ep => 
  `- ${ep.timestamp.split('T')[0]}: "${ep.task}" (${ep.success ? '✅ succès' : '❌ échec'})`
).join('\n')}

LEÇONS APPRISES:
${memoryContext.similarEpisodes.map(ep => {
  if (ep.errors && ep.errors.length > 0) {
    return `- Erreur récurrente: ${ep.errors[0]}`;
  }
  return `- Approche réussie: ${ep.actions?.[0]?.action || 'N/A'}`;
}).join('\n')}
` : ''}

${memoryContext.recurringErrors.length > 0 ? `⚠️ ERREURS RÉCURRENTES DÉTECTÉES:
${memoryContext.recurringErrors.map(err => 
  `- "${err.error}" (${err.count} fois) - ÉVITE de reproduire cette erreur !`
).join('\n')}
` : ''}

${Object.keys(memoryContext.relevantPatterns).length > 0 ? `💡 SOLUTIONS CONNUES:
${Object.entries(memoryContext.relevantPatterns).map(([pattern, solution]) => 
  `- ${pattern}: ${solution.solution || solution}`
).join('\n')}
` : ''}

UTILISE cette mémoire pour être plus efficace et éviter les erreurs passées !`;
  }

  // Phase 1: Découverte de l'environnement (CIBLÉE selon la tâche)
  const discoveryResults = {};
  
  // Déterminer ce qui doit être analysé selon la tâche
  const needsDirectoryListing = !task.includes('.py') && !task.includes('.js') && !task.includes('.ts') && !task.includes('.java') && !task.includes('.go');
  
  if (needsDirectoryListing) {
    // Si aucun fichier spécifique mentionné, lister le répertoire racine
    const listStep = {
      action: 'list_directory',
      description: 'Explorer la structure du répertoire',
      params: { path: '.' }
    };
    const result = await discoveryCallback(listStep);
    discoveryResults[listStep.action] = result;
    
    // Explorer les dossiers communs s'ils existent dans le listing
    if (result) {
      const commonDirs = ['src', 'components', 'app', 'pages', 'views', 'public', 'assets', 'styles'];
      const existingDirs = commonDirs.filter(dir => result.includes(dir));
      
      for (const dir of existingDirs.slice(0, 2)) { // Max 2 dossiers pour éviter la surcharge
        try {
          const dirListStep = {
            action: 'list_directory',
            description: `Explorer le dossier ${dir}`,
            params: { path: dir }
          };
          const dirResult = await discoveryCallback(dirListStep);
          discoveryResults[`list_${dir}`] = dirResult;
        } catch (error) {
          // Ignorer si le dossier ne peut pas être lu
        }
      }
    }
  }
  
  // Si la tâche mentionne un fichier spécifique, l'analyser directement
  const fileMatches = task.match(/([a-zA-Z0-9_-]+\.(py|js|ts|java|go|php|rb|cpp|c|h|tsx|jsx|vue|svelte))/g);
  const fileNamesWithoutExt = task.match(/\b(\w+(?:_\w+)*)\b/g)?.filter(name => 
    [
      // Backend keywords
      'server', 'client', 'main', 'app', 'config', 'utils', 'helper', 'handler', 'service', 'api', 'controller', 'model', 'middleware',
      // Frontend/UI keywords  
      'component', 'testimonial', 'testimonials', 'theme', 'style', 'css', 'header', 'footer', 'navbar', 'sidebar', 'modal', 'button', 'form', 'card', 'hero', 'banner', 'gallery', 'carousel', 'slider', 'menu', 'dropdown', 'accordion', 'tab', 'tooltip', 'popup', 'overlay', 'layout', 'grid', 'container', 'wrapper', 'section', 'article', 'widget', 'plugin'
    ].includes(name.toLowerCase()) ||
    name.includes('server') || name.includes('client') || name.includes('handler') ||
    name.includes('component') || name.includes('testimonial') || name.includes('theme') ||
    name.includes('style') || name.includes('ui') || name.includes('ux')
  );
  
  if (fileMatches) {
    for (const fileName of fileMatches.slice(0, 2)) { // Max 2 fichiers
      const analyzeStep = {
        action: 'analyze_file', 
        description: `Analyser ${fileName}`,
        params: { path: fileName }
      };
      try {
        const fileResult = await discoveryCallback(analyzeStep);
        discoveryResults[fileName] = fileResult;
      } catch (error) {
        // Ignorer si le fichier n'existe pas
      }
    }
  }
  
  // Recherche récursive de fichiers pertinents si aucun fichier spécifique n'a été trouvé
  if ((!fileMatches || Object.keys(discoveryResults).filter(k => k !== 'list_directory').length === 0) && 
      (fileNamesWithoutExt && fileNamesWithoutExt.length > 0)) {
    
    // Détecter le type de projet pour prioriser les bonnes extensions
    let possibleExtensions = ['.py', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.java', '.go', '.php'];
    
    // Prioriser selon la structure découverte
    if (discoveryResults.list_directory) {
      const rootFiles = discoveryResults.list_directory.toLowerCase();
      if (rootFiles.includes('package.json') || rootFiles.includes('yarn.lock') || rootFiles.includes('node_modules')) {
        // Projet JavaScript/Node.js - prioriser les extensions web
        possibleExtensions = ['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte', '.py', '.java', '.go', '.php'];
      } else if (rootFiles.includes('requirements.txt') || rootFiles.includes('setup.py') || rootFiles.includes('pyproject.toml')) {
        // Projet Python - garder .py en premier
        possibleExtensions = ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.go', '.php'];
      } else if (rootFiles.includes('pom.xml') || rootFiles.includes('build.gradle')) {
        // Projet Java
        possibleExtensions = ['.java', '.js', '.ts', '.py', '.php', '.go'];
      } else if (rootFiles.includes('go.mod')) {
        // Projet Go
        possibleExtensions = ['.go', '.js', '.ts', '.py', '.java', '.php'];
      }
    }
    
    // Essayer d'analyser les fichiers mentionnés sans extension
    for (const baseName of fileNamesWithoutExt.slice(0, 2)) { // Max 2 fichiers
      for (const ext of possibleExtensions) {
        try {
          const analyzeStep = {
            action: 'analyze_file',
            description: `Analyser ${baseName}${ext}`,
            params: { path: `${baseName}${ext}` }
          };
          const fileResult = await discoveryCallback(analyzeStep);
          discoveryResults[`${baseName}${ext}`] = fileResult;
          break; // Si trouvé, arrêter d'essayer d'autres extensions
        } catch (error) {
          // Continuer avec l'extension suivante
        }
      }
    }
    
    // Forcer la recherche récursive pour les projets web avec termes UI
    const foundFiles = Object.keys(discoveryResults).filter(k => k !== 'list_directory' && !k.startsWith('list_') && k.includes('.'));
    let shouldSearch = foundFiles.length === 0;
    
    // Pour les projets web (package.json détecté), toujours chercher les termes UI
    const isWebProject = discoveryResults.list_directory && discoveryResults.list_directory.toLowerCase().includes('package.json');
    const hasUITerms = fileNamesWithoutExt.some(term => 
      ['testimonial', 'testimonials', 'component', 'theme', 'style', 'navbar', 'header', 'footer', 'modal', 'button', 'form', 'card'].includes(term.toLowerCase())
    );
    
    if (isWebProject && hasUITerms) {
      shouldSearch = true;
      console.log('🌐 Projet web détecté avec termes UI - recherche récursive forcée');
    }
    
    if (shouldSearch) {
      try {
        const searchKeywords = fileNamesWithoutExt.join('|');
        
        // Adapter les extensions pour la recherche selon le type de projet
        let searchExtensions = "-name \"*.js\" -o -name \"*.ts\" -o -name \"*.jsx\" -o -name \"*.tsx\" -o -name \"*.vue\" -o -name \"*.svelte\" -o -name \"*.py\"";
        if (discoveryResults.list_directory) {
          const rootFiles = discoveryResults.list_directory.toLowerCase();
          if (rootFiles.includes('package.json')) {
            // Projet JavaScript/React - priorité aux extensions web
            searchExtensions = "-name \"*.tsx\" -o -name \"*.jsx\" -o -name \"*.ts\" -o -name \"*.js\" -o -name \"*.vue\" -o -name \"*.svelte\"";
          } else if (rootFiles.includes('requirements.txt')) {
            // Projet Python
            searchExtensions = "-name \"*.py\" -o -name \"*.js\" -o -name \"*.ts\"";
          }
        }
        
        const searchStep = {
          action: 'run_command',
          description: `Rechercher des fichiers contenant ${searchKeywords}`,
          params: { 
            command: `find . -type f \\( ${searchExtensions} \\) -exec grep -l -i "${searchKeywords}" {} \\; 2>/dev/null | head -5`,
            cwd: '.'
          }
        };
        const searchResult = await discoveryCallback(searchStep);
        if (searchResult && searchResult.trim()) {
          discoveryResults['file_search'] = searchResult;
          console.log(`🔍 Recherche récursive trouvée: ${searchResult.trim().split('\n').length} fichier(s)`);
          
          // Analyser les premiers fichiers trouvés
          const foundFiles = searchResult.trim().split('\n').slice(0, 2);
          for (const filePath of foundFiles) {
            if (filePath.trim()) {
              try {
                // Normaliser le chemin (enlever ./ du début si présent)
                const normalizedPath = filePath.trim().replace(/^\.\//, '');
                console.log(`📄 Analyse du fichier trouvé: ${normalizedPath}`);
                const analyzeStep = {
                  action: 'analyze_file',
                  description: `Analyser fichier trouvé ${normalizedPath}`,
                  params: { path: normalizedPath }
                };
                const fileResult = await discoveryCallback(analyzeStep);
                // Stocker avec le chemin normalisé
                discoveryResults[normalizedPath] = fileResult;
              } catch (error) {
                console.log(`❌ Erreur analyse ${filePath}: ${error.message}`);
              }
            }
          }
        } else {
          console.log('🔍 Recherche récursive: aucun fichier trouvé');
        }
      } catch (error) {
        // Ignorer les erreurs de recherche
      }
    }
  }

  // Phase 2: Génération du plan basé sur la découverte
  
  // Extraire les chemins exacts trouvés pour l'IA
  const foundFilePaths = Object.keys(discoveryResults).filter(key => 
    key !== 'list_directory' && 
    key !== 'file_search' && 
    !key.startsWith('list_') &&
    key.includes('.')  // Contient une extension de fichier
  );
  
  const userPrompt = `Tâche: "${task}"

DÉCOUVERTES:
${JSON.stringify(discoveryResults, null, 2)}

🎯 CHEMINS EXACTS TROUVÉS (UTILISE CES CHEMINS EXACTS):
${foundFilePaths.length > 0 ? foundFilePaths.map(path => `- ${path}`).join('\n') : 'Aucun fichier spécifique trouvé'}

${discoveryResults.file_search ? `
📁 RÉSULTATS DE LA RECHERCHE RÉCURSIVE:
${discoveryResults.file_search.split('\n').map(f => f.trim().replace(/^\.\//, '')).filter(f => f).map(path => `- ${path}`).join('\n')}
` : ''}

🚨 RÈGLE ABSOLUE - CHEMINS EXACTS UNIQUEMENT:
1. Tu DOIS utiliser EXCLUSIVEMENT les chemins listés dans "CHEMINS EXACTS TROUVÉS" ou "RÉSULTATS DE LA RECHERCHE RÉCURSIVE"
2. INTERDICTION TOTALE de reconstituer des chemins comme "src/components/Testimonials.tsx" 
3. Si aucun chemin n'est listé ci-dessus, tu dois dire "Aucun fichier pertinent trouvé" et demander une nouvelle recherche
4. EXEMPLE CORRECT: Si tu vois "components/Testimonial.jsx" dans les découvertes, utilise exactement "components/Testimonial.jsx"
5. EXEMPLE INCORRECT: Inventer "src/components/Testimonials.tsx" quand ce chemin n'est pas dans les découvertes

🔍 VÉRIFICATION: Avant chaque action, vérifie que le chemin utilisé est EXACTEMENT dans la liste ci-dessus

Génère un plan d'actions CIBLÉ. Si tu as déjà les infos nécessaires dans les découvertes, passe directement aux actions de correction/création.

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN:
{
  "analysis": "analyse ciblée",
  "strategy": "stratégie directe", 
  "status": "continue",
  "actions": [
    {
      "action": "patch_file|create_file|analyze_file|run_command",
      "description": "action concrète",
      "params": {"path": "CHEMIN_EXACT_DES_DÉCOUVERTES", "content": "..."} ou {"path": "CHEMIN_EXACT_DES_DÉCOUVERTES", "changes": [...]}
    }
  ]
}`;

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
      
      // VALIDATION CRITIQUE: Vérifier que l'IA n'invente pas de chemins
      const validationResult = validatePlanPaths(parsed, discoveryResults, foundFilePaths);
      if (!validationResult.valid) {
        console.log(chalk.red(`🚨 PLAN REJETÉ: ${validationResult.error}`));
        console.log(chalk.yellow(`   Chemins inventés: ${validationResult.invalidPaths.join(', ')}`));
        console.log(chalk.cyan(`   Chemins valides: ${foundFilePaths.join(', ')}`));
        
        // Générer un plan corrigé automatiquement
        const correctedPlan = generateCorrectedPlanPaths(parsed, discoveryResults, foundFilePaths);
        return { plan: correctedPlan, discoveries: discoveryResults };
      }
      
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
      
      throw new Error("Erreur de parsing JSON du plan d'actions");
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

  // Extraire les erreurs récurrentes pour éviter de les répéter
  const errors = [];
  const analyzedFiles = new Set();
  const analyzedFilesWithRanges = new Map(); // Track files with their line ranges
  const failedActions = new Set();
  const indentationErrors = [];
  
  executionResults.forEach(result => {
    if (result.results) {
      result.results.forEach(actionResult => {
        if (actionResult.action?.action === 'analyze_file' && actionResult.action?.params?.path) {
          analyzedFiles.add(actionResult.action.params.path);
          
          // Track exact ranges analyzed
          const rangeKey = `${actionResult.action.params.path}:${actionResult.action.params.startLine || '0'}-${actionResult.action.params.endLine || 'end'}`;
          const count = analyzedFilesWithRanges.get(rangeKey) || 0;
          analyzedFilesWithRanges.set(rangeKey, count + 1);
        }
        if (!actionResult.success && actionResult.error) {
          errors.push(`${actionResult.action?.action || 'action'}: ${actionResult.error}`);
          failedActions.add(`${actionResult.action?.action}:${actionResult.action?.params?.path || ''}`);
          
          // Détecter les erreurs d'indentation spécifiques
          if (actionResult.error.includes('IndentationError')) {
            indentationErrors.push(actionResult.error);
          }
        }
      });
    }
  });

  // Détecter les analyses répétées
  const repeatedAnalyses = Array.from(analyzedFilesWithRanges.entries())
    .filter(([key, count]) => count >= 2)
    .map(([key, count]) => `${key} (${count} fois)`);

  const systemPrompt = `Tu es un agent IA expert en résolution de problèmes de développement. Tu viens d'exécuter un plan et dois maintenant évaluer la situation avec précision.

🚨 DÉTECTION DE BOUCLE:
${repeatedAnalyses.length > 0 ? `Tu as analysé ces fichiers/plages PLUSIEURS FOIS:
${repeatedAnalyses.join('\n')}

STOP! Tu tournes en boucle. INTERDICTION de refaire analyze_file sur ces plages !` : ''}

IMPORTANT - APPRENTISSAGE DES ERREURS:
${errors.length > 0 ? `Tu as fait ces erreurs récemment - NE LES RÉPÈTE PAS:
${errors.map(e => `- ${e}`).join('\n')}

RÈGLES POUR ÉVITER LES ERREURS:
- Si un fichier n'existe pas, utilise d'abord "list_directory" pour voir ce qui est disponible
- Si tu cherches un fichier avec une extension manquante, ajoute l'extension appropriée (.py, .js, etc.)
- N'essaie JAMAIS d'analyser le même fichier inexistant plusieurs fois
- Pour IndentationError Python : la ligne mentionnée dans l'erreur a besoin d'indentation (4 espaces)
- Si "expected an indented block after class definition", la ligne APRÈS le ':' doit être indentée
- JAMAIS de patch_file avec old === new (ça ne change rien !)
- Si tu as déjà analysé un fichier, NE LE REFAIS PAS - passe à l'action !
` : ''}

${indentationErrors.length > 0 ? `🚨 ERREUR D'INDENTATION PERSISTANTE:
${indentationErrors[indentationErrors.length - 1]}

SOLUTION REQUISE pour IndentationError:
- Si "expected an indented block after class definition on line X", alors la ligne Y qui suit a besoin d'indentation
- Ajoute 4 espaces au début de la ligne problématique
- Exemple: change "def method(self):" en "    def method(self):" (4 espaces avant)
- OU ajoute "pass" indenté si la classe est vide: "    pass"
- APRÈS un patch_file: run_command avec "python fichier.py" pour VÉRIFIER que l'erreur est corrigée
- NE JAMAIS refaire analyze_file après un patch_file sauf si l'erreur change
` : ''}

ACTIONS DISPONIBLES avec paramètres requis:
- analyze_file: {"path": "fichier.ext"} - Fichier complet avec numéros si <50 lignes
- analyze_file: {"path": "fichier.ext", "startLine": 1, "endLine": 50} - LARGE plage (50+ lignes) avec numéros
- create_file: {"path": "fichier.ext", "content": "contenu complet"}
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "ancien texte", "new": "nouveau texte"}]}
- run_command: {"command": "commande shell", "cwd": "."}
- install_package: {"package": "nom-package"}
- create_directory: {"path": "chemin/dossier"}
- git_commit: {"message": "message commit"}
- list_directory: {"path": "chemin/repertoire"}

IMPORTANT POUR patch_file:
- Tu DOIS spécifier les changements exacts avec "old" et "new"
- Si tu ne connais pas le contenu exact de la ligne, utilise "analyze_file" d'abord
- Ne génère PAS de patch_file sans changements précis

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN, PAS DE BACKTICKS, PAS DE TEXTE AVANT/APRÈS.`;

  const userPrompt = `Tâche: "${task}"

Dernières actions exécutées:
${executionResults.map(r => {
  if (r.results) {
    return r.results.map(ar => `- ${ar.action?.action || 'action'}: ${ar.success ? '✅' : '❌'} ${ar.action?.params?.path || ar.action?.description || 'N/A'}`).join('\n');
  }
  return `- Plan ${r.planNumber}: ${r.results?.length || 0} actions`;
}).join('\n')}

Fichiers déjà analysés: ${Array.from(analyzedFiles).join(', ') || 'Aucun'}
Actions qui ont échoué: ${Array.from(failedActions).join(', ') || 'Aucune'}

${repeatedAnalyses.length > 0 ? `\n🔄 ALERTE BOUCLE: Tu as analysé ${repeatedAnalyses.length} fichier(s) PLUSIEURS FOIS !
${repeatedAnalyses.join('\n')}

Si l'erreur persiste après plusieurs analyses, c'est que:
1. Le patch_file précédent n'a pas fonctionné (vérifier le texte exact)
2. L'erreur est ailleurs dans le fichier
3. Il faut une approche différente

INTERDICTION de refaire analyze_file sur les mêmes plages !` : ''}

${errors.length > 0 ? `\n⚠️ ATTENTION: Tu as déjà fait ${errors.length} erreur(s). Apprends de tes erreurs !` : ''}

Décide: continuer ou terminer?

ÉVITE absolument de refaire les mêmes actions. Propose une NOUVELLE approche si nécessaire.

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN, PAS DE BACKTICKS:
{
  "status": "continue" ou "complete",
  "analysis": "bref résumé",
  "actions": [
    {
      "action": "analyze_file|create_file|patch_file|run_command",
      "description": "que faire",
      "params": {"path": "fichier.ext"} ou {"content": "..."} selon l'action
    }
  ]
}`;

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
      
      // VALIDATION: même validation pour les plans de continuation
      const mockDiscoveries = { list_directory: 'package.json' }; // Context minimal
      const mockFoundPaths = []; // Pas de chemins prédéfinis pour evaluation
      const validationResult = validatePlanPaths(parsed, mockDiscoveries, mockFoundPaths);
      if (!validationResult.valid) {
        console.log(chalk.red(`🚨 PLAN DE CONTINUATION REJETÉ: ${validationResult.error}`));
        console.log(chalk.yellow(`   Chemins inventés: ${validationResult.invalidPaths.join(', ')}`));
        
        // Corriger le plan pour utiliser des actions de recherche au lieu de chemins inventés
        const correctedPlan = {
          ...parsed,
          actions: [{
            action: 'run_command',
            description: 'Rechercher les fichiers de testimonial',
            params: {
              command: 'find . -name "*testimonial*" -type f 2>/dev/null',
              cwd: '.'
            }
          }]
        };
        return { plan: correctedPlan };
      }
      
      return { plan: parsed };
    } catch (parseError) {
      console.log(chalk.red(`[DEBUG] Erreur de parsing: ${parseError.message}`));
      
      // Essayer plusieurs méthodes de nettoyage
      let cleanedContent = content;
      
      // 1. Retirer les blocs markdown
      cleanedContent = cleanedContent.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '');
      
      // 2. Retirer les backticks simples en début/fin
      cleanedContent = cleanedContent.replace(/^`+|`+$/g, '');
      
      // 3. Chercher le JSON principal
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log(chalk.yellow('[DEBUG] Tentative de nettoyage JSON...'));
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          console.log(chalk.green('[DEBUG] Nettoyage réussi !'));
          return { plan: parsed };
        } catch (secondParseError) {
          console.log(chalk.red(`[DEBUG] Nettoyage échoué: ${secondParseError.message}`));
          
          // 4. Tentative de nettoyage plus agressive
          let aggressiveClean = jsonMatch[0];
          aggressiveClean = aggressiveClean.replace(/[\u201C\u201D]/g, '"'); // Guillemets courbes → droits
          aggressiveClean = aggressiveClean.replace(/[\u2018\u2019]/g, "'"); // Apostrophes courbes → droites
          
          try {
            const parsed = JSON.parse(aggressiveClean);
            console.log(chalk.green('[DEBUG] Nettoyage agressif réussi !'));
            return { plan: parsed };
          } catch (finalError) {
            console.log(chalk.red(`[DEBUG] Échec final: ${finalError.message}`));
          }
        }
      }
      
      throw new Error("Erreur de parsing JSON de l'évaluation IA");
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
 * Génère un nouveau plan avec des instructions spécifiques de l'utilisateur
 */
export async function generateCorrectedPlan(task, userInstructions, previousContext = {}) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  const systemPrompt = `Tu es un agent IA autonome expert en développement. L'utilisateur t'a donné des instructions spécifiques pour corriger ou améliorer ta stratégie.

MISSION: Générer un nouveau plan basé sur les instructions de l'utilisateur.

INSTRUCTIONS UTILISATEUR: "${userInstructions}"

TU DOIS:
- Prendre en compte les instructions spécifiques de l'utilisateur
- Adapter ta stratégie en conséquence  
- Générer des actions concrètes et correctes
- Expliquer comment tu prends en compte les instructions

ACTIONS DISPONIBLES (avec paramètres requis):
- analyze_file: {"path": "fichier.ext"} - Lire fichier complet (numéros auto si <50 lignes)
- analyze_file: {"path": "fichier.ext", "startLine": 1, "endLine": 50} - Lire LARGE plage (50+ lignes) AVEC numéros
- create_file: {"path": "fichier.ext", "content": "contenu complet"}
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "texte exact actuel", "new": "nouveau texte"}]}
- run_command: {"command": "commande shell", "cwd": "."}
- install_package: {"package": "nom-package"}
- create_directory: {"path": "chemin/dossier"}
- git_commit: {"message": "message commit"}
- list_directory: {"path": "chemin/repertoire"}

RÈGLES CRITIQUES POUR patch_file:
- Tu DOIS analyser le fichier d'abord pour connaître le contenu exact
- Pour erreur ligne N spécifique: analyze_file avec startLine/endLine pour voir les numéros !
- Tu DOIS spécifier le texte exact dans "old" qui existe vraiment dans le fichier
- PAS de patch_file sans connaître le contenu exact de la ligne
- EXEMPLE: erreur ligne 15 → analyze_file avec startLine=1, endLine=50 (LARGE contexte)`;

  const userPrompt = `TÂCHE ORIGINALE: "${task}"

INSTRUCTIONS SPÉCIFIQUES DE L'UTILISATEUR: "${userInstructions}"

CONTEXTE PRÉCÉDENT:
${JSON.stringify(previousContext, null, 2)}

Répertoire de travail: ${process.cwd()}

Génère maintenant un nouveau plan qui prend en compte les instructions de l'utilisateur.

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN:
{
  "analysis": "ton analyse de la situation et comment tu prends en compte les instructions",
  "strategy": "ta nouvelle stratégie basée sur les instructions utilisateur", 
  "status": "continue|complete",
  "reasoning": "pourquoi cette approche répond aux instructions de l'utilisateur",
  "actions": [
    {
      "action": "create_file|modify_file|patch_file|run_command|install_package|create_directory|git_commit|analyze_file|list_directory",
      "description": "Description lisible de l'action", 
      "params": { /* paramètres complets */ }
    }
  ]
}

STATUTS OBLIGATOIRES:
- "continue": Tu as du travail à faire avec cette nouvelle approche
- "complete": La tâche est terminée selon les instructions utilisateur

RÈGLE CRITIQUE: TOUJOURS inclure TOUS les paramètres requis dans "params"
RÈGLE IMPORTANTE: Explique clairement comment tu prends en compte les instructions utilisateur`;

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
      
      throw new Error("Erreur de parsing JSON du plan corrigé");
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