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
  
  // Toujours ajouter les chemins courants comme valides
  validPaths.add('.');
  validPaths.add('./');
  validPaths.add(process.cwd());
  
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
 * Génère un plan d'actions moderne (sans découverte interactive obsolète)
 */
export async function generateActionPlan(task, options = {}) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  // Utiliser le system prompt moderne comme evaluateAndContinue
  const systemPrompt = `Tu es un agent IA expert en développement, capable de résoudre des problèmes techniques complexes de manière méthodique et efficace.

<identity>
Tu es un développeur senior expérimenté avec une expertise approfondie en:
- Résolution de bugs et erreurs de compilation
- Analyse de code et détection de problèmes
- Correction d'erreurs d'indentation et de syntaxe
- Utilisation efficace des outils de développement
</identity>

<available_actions>
- read_file_lines: {"path": "fichier.ext", "start_line": 1, "end_line": 50} - OBLIGATOIRE: minimum 50 lignes (end_line - start_line + 1 >= 50)
- create_file: {"path": "fichier.ext", "content": "contenu complet"} - content optionnel (fichier vide si omis)
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "texte exact actuel", "new": "nouveau texte"}]}
- run_command: {"command": "commande shell", "cwd": ".", "timeout": 5000} - timeout optionnel en ms pour serveurs
- create_directory: {"path": "chemin/dossier"}
- list_directory: {"path": "chemin/repertoire"}
</available_actions>

<critical_rules>
1. 🎯 PRIORITÉ ABSOLUE: Si un message d'erreur contient un chemin complet, utilise ce chemin EXACT
2. 📋 AVANT patch_file: TOUJOURS faire read_file_lines pour connaître le contenu exact de la ligne
3. 📐 Pour erreurs de ligne spécifique: utilise read_file_lines avec LARGE contexte (minimum 50 lignes autour de l'erreur)
4. ❌ JAMAIS de patch_file avec des changements vides ou approximatifs
5. 🔄 ÉVITER les boucles: ne pas répéter les mêmes actions
6. 🎯 EFFICACITÉ: Si la tâche mentionne un fichier précis, l'analyser directement
</critical_rules>

<error_handling_expertise>
- IndentationError: Toujours analyser au moins 50 lignes autour de l'erreur pour voir la structure complète
- File not found: Utiliser le chemin COMPLET de l'erreur, pas juste le nom du fichier
- Syntax errors: Analyser le contexte large pour comprendre la structure du code
</error_handling_expertise>`;

  // Ajouter le contexte de mémoire si disponible
  let memoryPrompt = '';
  if (options.memory && options.memory.hasContext) {
    memoryPrompt = `

🧠 MÉMOIRE PERSISTANTE DISPONIBLE:

${options.memory.similarEpisodes?.length > 0 ? `ÉPISODES SIMILAIRES PASSÉS:
${options.memory.similarEpisodes.map(ep => 
  `- ${ep.timestamp.split('T')[0]}: "${ep.task}" (${ep.success ? '✅ succès' : '❌ échec'})`
).join('\n')}

LEÇONS APPRISES:
${options.memory.similarEpisodes.map(ep => {
  if (ep.errors && ep.errors.length > 0) {
    return `- Erreur récurrente: ${ep.errors[0]}`;
  }
  return `- Approche réussie: ${ep.actions?.[0]?.action || 'N/A'}`;
}).join('\n')}
` : ''}

${options.memory.recurringErrors?.length > 0 ? `⚠️ ERREURS RÉCURRENTES DÉTECTÉES:
${options.memory.recurringErrors.map(err => 
  `- "${err.error}" (${err.count} fois) - ÉVITE de reproduire cette erreur !`
).join('\n')}
` : ''}

${Object.keys(options.memory.relevantPatterns || {}).length > 0 ? `💡 SOLUTIONS CONNUES:
${Object.entries(options.memory.relevantPatterns).map(([pattern, solution]) => 
  `- ${pattern}: ${solution.solution || solution}`
).join('\n')}
` : ''}

UTILISE cette mémoire pour être plus efficace et éviter les erreurs passées !`;
  }

  const userPrompt = `Tâche: "${task}"

Génère un plan d'actions COMPLET pour accomplir entièrement la tâche. Planifie TOUTES les étapes nécessaires :
1. Si tu dois lire des fichiers - inclus les actions read_file_lines
2. Si tu dois modifier des fichiers - inclus les actions patch_file  
3. Si tu dois créer des fichiers - inclus les actions create_file
4. Si tu dois tester - inclus les actions run_command

OBJECTIF: Générer un plan complet qui accomplira la tâche en une seule exécution, pas juste la première étape.

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN:
{
  "analysis": "analyse ciblée",
  "strategy": "stratégie directe", 
  "status": "continue",
  "actions": [
    {
      "action": "patch_file|create_file|read_file_lines|run_command",
      "description": "action concrète",
      "params": {"path": "chemin/fichier", "content": "..."} ou {"path": "chemin/fichier", "changes": [...]}
    }
  ]
}`;

  try {
    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: systemPrompt + memoryPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    // Afficher les informations sur les tokens
    if (response.usage) {
      console.log(chalk.gray(`📋 Planification - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const content = response.choices[0].message.content.trim();
    
    try {
      const parsed = JSON.parse(content);
      return { plan: parsed };
    } catch (parseError) {
      // Essayer de nettoyer le JSON si il y a des caractères en trop
      let cleanContent = content;
      
      // Chercher le JSON dans la réponse
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
        try {
          const parsed = JSON.parse(cleanContent);
          return { plan: parsed };
        } catch (secondParseError) {
          // Échec même après nettoyage
        }
      }
      
      throw new Error("Erreur de parsing JSON du plan d'actions");
    }

  } catch (error) {
    console.log(chalk.red(`❌ Erreur lors de la génération du plan: ${error.message}`));
    throw error;
  }
}

/**
 * Génère la prochaine action unique à effectuer (approche itérative)
 */
export async function generateNextAction(task, previousActions = [], options = {}) {
  const client = getOpenAIClient();
  const activeConfig = getActiveConfig();

  const systemPrompt = `Tu es un agent IA expert en développement. Tu dois déterminer la PROCHAINE action unique à effectuer pour accomplir la tâche.

<identity>
Tu es un développeur senior expérimenté avec une expertise approfondie en:
- Résolution de bugs et erreurs de compilation
- Analyse de code et détection de problèmes
- Correction d'erreurs d'indentation et de syntaxe
- Utilisation efficace des outils de développement
</identity>

<available_actions>
- read_file_lines: {"path": "fichier.ext", "start_line": 1, "end_line": 50} - OBLIGATOIRE: minimum 50 lignes
- create_file: {"path": "fichier.ext", "content": "contenu complet"} - content optionnel (fichier vide si omis)
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "texte exact actuel", "new": "nouveau texte"}]}
- run_command: {"command": "commande shell", "cwd": ".", "timeout": 5000}
- create_directory: {"path": "chemin/dossier"}
- list_directory: {"path": "chemin/repertoire"}
</available_actions>

<critical_rules>
1. 🎯 NE GÉNÈRE QU'UNE SEULE ACTION - pas un plan complet
2. 📋 AVANT patch_file: TOUJOURS faire read_file_lines pour connaître le contenu exact
3. 📝 create_file: path requis, content optionnel (fichier vide par défaut)
4. 🔄 ÉVITER les boucles: ne pas répéter les mêmes actions
5. 🎯 EFFICACITÉ: Prends en compte les actions déjà effectuées
</critical_rules>`;

  // Ajouter le contexte des actions précédentes
  let previousActionsContext = '';
  if (previousActions.length > 0) {
    previousActionsContext = `

📋 ACTIONS DÉJÀ EFFECTUÉES:
${previousActions.map((action, index) => 
  `${index + 1}. ${action.description} (${action.status})`
).join('\n')}

${previousActions.filter(a => a.result).length > 0 ? `📤 RÉSULTATS COMPLETS DES ACTIONS PRÉCÉDENTES:
${previousActions.filter(a => a.result).slice(-3).map(action => 
  `- ${action.description}:
${action.result}`
).join('\n\n')}` : ''}

🚨 RÈGLES ANTI-RÉPÉTITION:
${previousActions.some(a => a.action === 'list_directory') ? '- Tu as déjà listé le contenu du répertoire - NE LE REFAIS PAS !' : ''}
${previousActions.filter(a => a.action === 'read_file_lines').map(a => a.params?.path).filter(Boolean).length > 0 ? `- Tu as déjà lu ces fichiers: ${[...new Set(previousActions.filter(a => a.action === 'read_file_lines').map(a => a.params?.path).filter(Boolean))].join(', ')} - NE LES RELIS PAS !` : ''}

🔥 GESTION AUTOMATIQUE DES ERREURS COURANTES:
${previousActions.some(a => a.status === 'failed' && a.error?.includes('Address already in use')) ? '- ERREUR "Address already in use" détectée → Génère une commande pour tuer le processus existant (ex: "pkill python" ou "lsof -ti:8000 | xargs kill")' : ''}
${previousActions.some(a => a.status === 'failed' && a.error?.includes('Permission denied')) ? '- ERREUR "Permission denied" détectée → Génère une commande avec sudo ou change les permissions' : ''}
${previousActions.some(a => a.status === 'failed' && a.error?.includes('No such file')) ? '- ERREUR "No such file" détectée → Vérifie le chemin exact ou crée le fichier manquant' : ''}`;
  }

  const userPrompt = `Tâche: "${task}"
${previousActionsContext}

ANALYSE la situation actuelle et détermine la PROCHAINE action unique à effectuer.

🎯 INSTRUCTIONS CRITIQUES:
- UTILISE les résultats des actions précédentes pour avancer intelligemment
- NE RÉPÈTE JAMAIS une action déjà faite (surtout list_directory ou read_file_lines)
- Si tu as les informations nécessaires, PASSE À L'ACTION (create_file, patch_file, etc.)
- Sois EFFICACE et DIRECT dans tes choix
- Si une action précédente a ÉCHOUÉ, génère automatiquement une action de CORRECTION (ne demande rien à l'utilisateur)

🔧 GESTION AUTOMATIQUE DES ERREURS:
- "Address already in use" → run_command: "pkill python" ou "lsof -ti:PORT | xargs kill"
- "Permission denied" → run_command avec sudo ou changement de permissions
- "No such file" → create_file ou correction du chemin
- "Module not found" → run_command: "pip install MODULE"

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN:
{
  "analysis": "analyse intelligente de ce qui doit être fait MAINTENANT basée sur les résultats précédents",
  "next_action": {
    "action": "patch_file|create_file|read_file_lines|run_command|create_directory|list_directory",
    "description": "description précise de l'action",
    "params": {"path": "chemin/fichier", ...}
  },
  "status": "continue|completed"
}

EXEMPLES DE PARAMS CORRECTS:
- create_file: {"path": "server.log"} ← Fichier vide (content optionnel)
- create_file: {"path": "server.log", "content": ""} ← Fichier vide (explicite)
- create_file: {"path": "config.py", "content": "# Configuration\nport = 8000\n"}
- run_command: {"command": "pkill python", "cwd": "."}
- read_file_lines: {"path": "http_server.py", "start_line": 1, "end_line": 50}

Si la tâche est terminée, mets "status": "completed"`;

  try {
    const response = await client.chat.completions.create({
      model: activeConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 1000
    });

    // Afficher les informations sur les tokens
    if (response.usage) {
      console.log(chalk.gray(`🔄 Action - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const content = response.choices[0].message.content.trim();
    
    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch (parseError) {
      // Essayer de nettoyer le JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return parsed;
        } catch (secondParseError) {
          // Échec
        }
      }
      
      throw new Error("Erreur de parsing JSON de l'action");
    }

  } catch (error) {
    console.log(chalk.red(`❌ Erreur lors de la génération de l'action: ${error.message}`));
    throw error;
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
  
  // Normaliser les données pour gérer les deux formats possibles
  const normalizedResults = Array.isArray(executionResults) ? executionResults : [];
  
  normalizedResults.forEach(result => {
    // Format 1: result a une propriété results (ancien format)
    if (result.results && Array.isArray(result.results)) {
      result.results.forEach(actionResult => {
        if (actionResult.action?.action === 'analyze_file' && actionResult.action?.params?.path) {
          analyzedFiles.add(actionResult.action.params.path);
          
          const rangeKey = `${actionResult.action.params.path}:${actionResult.action.params.startLine || '0'}-${actionResult.action.params.endLine || 'end'}`;
          const count = analyzedFilesWithRanges.get(rangeKey) || 0;
          analyzedFilesWithRanges.set(rangeKey, count + 1);
        }
        if (!actionResult.success && actionResult.error) {
          errors.push(`${actionResult.action?.action || 'action'}: ${actionResult.error}`);
          failedActions.add(`${actionResult.action?.action}:${actionResult.action?.params?.path || ''}`);
          
          if (actionResult.error.includes('IndentationError')) {
            indentationErrors.push(actionResult.error);
          }
        }
      });
    }
    // Format 2: result est directement un completedStep (nouveau format)
    else if (result.action || result.description) {
      if (result.action === 'analyze_file' && result.params?.path) {
        analyzedFiles.add(result.params.path);
        
        const rangeKey = `${result.params.path}:${result.params.startLine || '0'}-${result.params.endLine || 'end'}`;
        const count = analyzedFilesWithRanges.get(rangeKey) || 0;
        analyzedFilesWithRanges.set(rangeKey, count + 1);
      }
      if (result.status !== 'completed' && result.error) {
        errors.push(`${result.action || result.description || 'action'}: ${result.error}`);
        failedActions.add(`${result.action}:${result.params?.path || ''}`);
        
        if (result.error.includes('IndentationError')) {
          indentationErrors.push(result.error);
        }
      }
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
- read_file_lines: {"path": "fichier.ext", "start_line": 1, "end_line": 50} - OBLIGATOIRE: minimum 50 lignes (end_line - start_line + 1 >= 50)
- create_file: {"path": "fichier.ext", "content": "contenu complet"}
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "ancien texte", "new": "nouveau texte"}]}
- run_command: {"command": "commande shell", "cwd": ".", "timeout": 5000} - timeout optionnel en ms pour serveurs
- create_directory: {"path": "chemin/dossier"}
- list_directory: {"path": "chemin/repertoire"}

🕐 UTILISATION DU TIMEOUT pour run_command:
- AJOUTE "timeout": 5000 (5 secondes) pour tester des serveurs/applications qui ne s'arrêtent pas
- Exemples: python3 server.py, node app.js, npm start, uvicorn main:app
- Le processus sera automatiquement tué après le timeout
- Tu recevras stdout/stderr pour évaluer si le serveur a bien démarré
- N'ajoute PAS de timeout pour des commandes normales (ls, cat, grep, etc.)

IMPORTANT POUR patch_file:
- Tu DOIS spécifier les changements exacts avec "old" et "new"
- Si tu ne connais pas le contenu exact de la ligne, utilise "read_file_lines" d'abord avec minimum 50 lignes
- Ne génère PAS de patch_file sans changements précis

RÉPONDS UNIQUEMENT EN JSON VALIDE - PAS DE MARKDOWN, PAS DE BACKTICKS, PAS DE TEXTE AVANT/APRÈS.`;

  const userPrompt = `🎯 TÂCHE ORIGINALE: "${task}"

💬 CONVERSATION COMPLÈTE (BRUTE - SANS INTERPRÉTATION):
${normalizedResults.map((result, index) => {
  const stepNum = index + 1;
  const action = result.action || result.description || 'Action inconnue';
  const status = result.status === 'completed' ? '✅' : '❌';
  
  let conversation = `\n${stepNum}. ${status} ${action}`;
  
  // Montrer la sortie BRUTE/RAW de la commande ou action
  if (result.result && typeof result.result === 'string') {
    const rawResult = result.result.trim();
    if (rawResult) {
      conversation += `\n   SORTIE BRUTE:\n   ${rawResult.split('\n').map(line => `   ${line}`).join('\n')}`;
    }
  }
  
  // Montrer les erreurs aussi dans la conversation brute
  if (result.error && typeof result.error === 'string') {
    const rawError = result.error.trim();
    if (rawError) {
      conversation += `\n   ERREUR BRUTE:\n   ${rawError.split('\n').map(line => `   ${line}`).join('\n')}`;
    }
  }
  
  return conversation;
}).join('\n')}

🔍 ACTIONS DÉJÀ EXÉCUTÉES ET LEURS RÉSULTATS:
${normalizedResults.map((r, index) => {
  // Gérer les deux formats possibles
  let actionName, status, resultText = '';
  
  if (r.results && Array.isArray(r.results)) {
    // Format ancien: result contient results
    actionName = `Plan ${index + 1} (${r.results.length} actions)`;
    status = r.results.every(ar => ar.success) ? '✅' : '❌';
    
    // Montrer les résultats des actions individuelles
    const actionDetails = r.results.map(ar => {
      const arStatus = ar.success ? '✅' : '❌';
      const arName = ar.action?.action || ar.description || 'action';
      return `${arStatus} ${arName}`;
    }).join(', ');
    resultText = `\n   Actions: ${actionDetails}`;
  } else {
    // Format nouveau: result est directement une action complétée
    actionName = r.action || r.description || 'Action inconnue';
    status = r.status === 'completed' ? '✅' : '❌';
    
    // Inclure les résultats détaillés pour chaque action
    if (r.result && typeof r.result === 'string' && r.result.trim()) {
      // Limiter l'affichage des résultats longs
      const lines = r.result.trim().split('\n');
      if (lines.length > 3) {
        resultText = `\n   Résultat: ${lines.slice(0, 3).join(', ')} ... (${lines.length} lignes total)`;
      } else {
        resultText = `\n   Résultat: ${r.result.trim()}`;
      }
    }
  }
  
  return `${index + 1}. ${status} ${actionName}${resultText}`;
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

🎯 ÉVALUATION STRICTE DE LA TÂCHE ORIGINALE:

TÂCHE DEMANDÉE: "${task}"

ANALYSE DES RÉSULTATS OBTENUS:
${executionResults.map((r, index) => {
  const status = r.status === 'completed' ? '✅' : '❌';
  const actionName = r.description || r.action || 'Action inconnue';
  
  // Analyser les résultats pour extraire des informations utiles
  let insights = '';
  if (r.result && typeof r.result === 'string') {
    const result = r.result.toLowerCase();
    
    // Détecter des fichiers trouvés
    if (result.includes('./test.js') || result.includes('test.js')) {
      insights += ' → test.js trouvé';
    }
    
    // Détecter du contenu lu
    if (result.includes('function ') && result.includes('console.log')) {
      insights += ' → contenu lu, fonctions détectées';
    }
    
    // Détecter des modifications
    if (result.includes('modifié') || result.includes('ajouté')) {
      insights += ' → fichier modifié';
    }
  }
  
  return `${status} ${actionName}${insights}`;
}).join('\n')}

🤔 ANALYSE OBLIGATOIRE - NE PAS RÉPÉTER LES ACTIONS DÉJÀ FAITES:

1. FICHIERS DÉJÀ TROUVÉS: 
   ${executionResults.some(r => r.result && r.result.includes('./test.js')) ? '✅ test.js est déjà trouvé/localisé' : '❌ test.js pas encore trouvé'}

2. CONTENU DÉJÀ LU:
   ${executionResults.some(r => r.result && r.result.includes('function ') && r.result.includes('add')) ? '✅ test.js déjà lu, contenu connu' : '❌ test.js pas encore lu'}

3. MODIFICATIONS DÉJÀ FAITES:
   ${executionResults.some(r => r.result && (r.result.includes('divide') || r.result.includes('modifié'))) ? '✅ fonction divide déjà ajoutée' : '❌ fonction divide pas encore ajoutée'}

🧠 ANALYSE DE LA CONVERSATION BRUTE CI-DESSUS:

Regarde la sortie BRUTE des commandes exécutées et détermine ce qui a RÉELLEMENT été fait.

⚠️ RÈGLES CRITIQUES POUR LIRE LES RÉSULTATS:

📁 FICHIERS TROUVÉS:
- SI tu vois "./test.js" dans une sortie de find → test.js EST TROUVÉ
- SI tu vois une liste de dossiers → le répertoire A ÉTÉ LISTÉ

📖 FICHIERS LUS:
- SI tu vois "📄 Contenu (X lignes):" suivi de code → le fichier A ÉTÉ LU
- SI tu vois des numéros de lignes avec du code → le contenu EST CONNU

🔧 MODIFICATIONS RÉUSSIES:
- SI tu vois "✅ Fichier modifié avec succès" → la modification EST TERMINÉE
- SI tu vois "📊 X/X changement(s) appliqué(s)" → le patch A FONCTIONNÉ
- SI tu vois "💾 Sauvegarde créée" → le fichier A ÉTÉ MODIFIÉ

❌ MODIFICATIONS ÉCHOUÉES:
- SI tu vois "❌ Aucun changement appliqué" → le patch A ÉCHOUÉ
- SI tu vois "texte non trouvé" → il faut relire le fichier d'abord

🎯 DÉTERMINE LA PROCHAINE ÉTAPE LOGIQUE:

En regardant la conversation brute ci-dessus, réponds à ces questions :

1. Y a-t-il un "✅ Fichier modifié avec succès" pour test.js ?
   ${normalizedResults.some(r => r.result && r.result.includes('✅ Fichier modifié avec succès') && r.result.includes('test.js')) ? '→ OUI, test.js A ÉTÉ MODIFIÉ' : '→ NON, pas encore modifié'}

2. Y a-t-il un "📊 X/X changement(s) appliqué(s)" avec succès ?
   ${normalizedResults.some(r => r.result && r.result.includes('changement(s) appliqué(s)') && !r.result.includes('❌')) ? '→ OUI, changements APPLIQUÉS' : '→ NON, pas de changements appliqués'}

3. La tâche "${task}" est-elle TERMINÉE ?
   ${normalizedResults.some(r => r.result && r.result.includes('✅ Fichier modifié avec succès') && r.result.includes('test.js')) ? '→ ✅ OUI, TÂCHE TERMINÉE' : '→ ❌ NON, continuer'}

DÉCISION FINALE: ${normalizedResults.some(r => r.result && r.result.includes('✅ Fichier modifié avec succès') && r.result.includes('test.js')) ? 'status: "complete"' : 'status: "continue"'}

EXEMPLES CONCRETS:
- Si la tâche est "ajoute la function divide et son test dans test.js":
  * ❌ "continue" si tu as seulement trouvé test.js (il faut encore ajouter la fonction ET le test)
  * ✅ "complete" seulement si la fonction divide ET son test ont été ajoutés à test.js
  
- Si la tâche est "créer un composant Button":
  * ❌ "continue" si tu as seulement créé le dossier (il faut encore créer le fichier)
  * ✅ "complete" seulement si le composant Button est entièrement créé

DÉCISION:
- "continue" : Il manque encore des éléments concrets de la tâche originale
- "complete" : TOUS les éléments demandés ont été entièrement accomplis

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

    // Afficher les informations sur les tokens pour evaluateAndContinue
    if (response.usage) {
      console.log(chalk.gray(`🔄 Évaluation - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

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
- read_file_lines: {"path": "fichier.ext", "start_line": 1, "end_line": 50} - OBLIGATOIRE: minimum 50 lignes (end_line - start_line + 1 >= 50)
- create_file: {"path": "fichier.ext", "content": "contenu complet"}
- patch_file: {"path": "fichier.ext", "changes": [{"action": "replace", "line": 15, "old": "texte exact actuel", "new": "nouveau texte"}]}
- run_command: {"command": "commande shell", "cwd": ".", "timeout": 5000} - timeout optionnel en ms pour serveurs
- create_directory: {"path": "chemin/dossier"}
- list_directory: {"path": "chemin/repertoire"}

RÈGLES CRITIQUES POUR patch_file:
- Tu DOIS lire le fichier d'abord pour connaître le contenu exact
- Pour erreur ligne N spécifique: read_file_lines avec minimum 50 lignes autour de l'erreur !
- Tu DOIS spécifier le texte exact dans "old" qui existe vraiment dans le fichier
- PAS de patch_file sans connaître le contenu exact de la ligne
- EXEMPLE: erreur ligne 15 → read_file_lines avec start_line=1, end_line=50 (minimum 50 lignes)`;

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
      "action": "create_file|modify_file|patch_file|run_command|create_directory|read_file_lines|list_directory",
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

    // Afficher les informations sur les tokens pour evaluateAndContinue
    if (response.usage) {
      console.log(chalk.gray(`🔄 Évaluation - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

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