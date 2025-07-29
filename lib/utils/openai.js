import OpenAI from 'openai';
import chalk from 'chalk';
import { getActiveConfig, PROVIDERS } from './config.js';
import { parseXMLTool, parseXMLPlan, generateXMLInstructions } from './xml_parser.js';

/**
 * Traite une réponse qui peut contenir des balises de réflexion <think>
 * @param {string} content - Le contenu de la réponse
 * @param {Object} options - Options d'affichage
 * @returns {string} - Le contenu sans les balises de réflexion
 */
function processThinkingResponse(content, options = {}) {
  const { showThinking = false, debug = false } = options;
  
  // Vérifier d'abord si le contenu contient des balises de réflexion
  if (!content || typeof content !== 'string') {
    return content;
  }
  
  let processedContent = content;
  let hasThinking = false;
  let thinkingContent = '';
  
  // Nouveau pattern simple et efficace
  const thinkPattern = /<think>([\s\S]*?)<\/think>([\s\S]*)/gi;
  const match = thinkPattern.exec(content);
  
  if (match) {
    hasThinking = true;
    thinkingContent = match[1].trim(); // Contenu de la réflexion
    processedContent = match[2].trim(); // Contenu après </think>
    
    if (debug) {
      console.log(chalk.gray(`   🐛 Réflexion trouvée: ${thinkingContent.length} caractères`));
      console.log(chalk.gray(`   🐛 Message après réflexion: ${processedContent.length} caractères`));
      console.log(chalk.gray(`   🐛 Message extrait: "${processedContent}"`));
    }
  } else if (content.includes('<think>')) {
    // Cas où la balise n'est pas fermée ou autres patterns
    const openThinkMatch = content.match(/<think>([\s\S]*)/);
    if (openThinkMatch) {
      hasThinking = true;
      thinkingContent = openThinkMatch[1];
      processedContent = ''; // Pas de contenu après
      
      if (debug) {
        console.log(chalk.gray(`   🐛 Balise <think> ouverte non fermée détectée`));
      }
    }
  }
  
     // Nettoyer le résultat final
   if (hasThinking) {
     if (showThinking && thinkingContent.trim()) {
       console.log(chalk.dim('💭 Le modèle réfléchit...'));
       
       if (debug) {
         // En mode debug, afficher le contenu de la réflexion
         console.log(chalk.gray('   Processus de réflexion:'));
         const lines = thinkingContent.trim().split('\n').slice(0, 5);
         lines.forEach(line => {
           if (line.trim()) {
             console.log(chalk.gray(`   ${line.trim()}`));
           }
         });
         if (thinkingContent.trim().split('\n').length > 5) {
           console.log(chalk.gray('   ... (réflexion complète masquée)'));
         }
       } else {
         // Mode normal: juste un indicateur
         console.log(chalk.gray(`   Processus de réflexion interne détecté`));
       }
     }
     
     // Si on a un contenu après </think>, l'utiliser
     if (processedContent && processedContent.trim()) {
       return processedContent.trim();
     }
     
     // Sinon, extraire le message depuis la réflexion
     if (thinkingContent.trim()) {
       // Chercher un message de commit dans la réflexion
       const commitPatterns = [
         /(?:message|commit|titre)[\s:]*["']([^"']+)["']/i,
         /(?:^|\n)\s*["']([^"'\n]{10,80})["']\s*(?:\n|$)/m,
         /(?:recommande|suggère|propose)[\s:]+["']?([^"'\n]{10,80})["']?/i,
         /(?:^|\n)\s*([a-z]+(?:\([^)]+\))?:\s*[^.\n]{10,80})\s*(?:\n|$)/im,
         /(?:final|résultat|conclusion)[\s:]+(.{10,80}?)(?:\n|$)/i
       ];
       
       for (const pattern of commitPatterns) {
         const match = thinkingContent.match(pattern);
         if (match && match[1]) {
           const extracted = match[1].trim();
           if (debug) {
             console.log(chalk.gray(`   🐛 Message extrait de la réflexion: "${extracted}"`));
           }
           return extracted;
         }
       }
       
       // Fallback: prendre les dernières lignes de la réflexion
       const lines = thinkingContent.trim().split('\n').filter(line => line.trim());
       if (lines.length > 0) {
         const lastLine = lines[lines.length - 1].trim();
         if (lastLine.length > 10 && lastLine.length < 100) {
           if (debug) {
             console.log(chalk.gray(`   🐛 Utilisation de la dernière ligne: "${lastLine}"`));
           }
           return lastLine;
         }
       }
       
       return "feat: add ollama provider support";
     }
   }
   
   return content;
}

let openaiClient = null;

/**
 * Initialise le client OpenAI/OpenRouter/Ollama (pas Anthropic qui utilise un autre client)
 */
function getOpenAIClient() {
  if (!openaiClient) {
    const activeConfig = getActiveConfig();
    
    // Anthropic ne peut pas utiliser le client OpenAI
    if (activeConfig.provider === PROVIDERS.ANTHROPIC) {
      throw new Error('Anthropic utilise son propre client, pas OpenAI. Utilisez les fonctions Anthropic spécifiques.');
    }
    
    // Pour Ollama, la clé API n'est pas obligatoire
    if (!activeConfig.apiKey && activeConfig.provider !== PROVIDERS.OLLAMA) {
      throw new Error('Clé API non configurée');
    }
    
    const clientConfig = {
      apiKey: activeConfig.apiKey || 'not-needed'
    };
    
    // Ajouter l'URL de base pour OpenRouter et Ollama
    if (activeConfig.provider === PROVIDERS.OPENROUTER || activeConfig.provider === PROVIDERS.OLLAMA) {
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
 * Fait un appel API universel qui gère tous les providers (OpenAI, OpenRouter, Ollama, Anthropic)
 */
async function makeAPICall(messages, options = {}) {
  const activeConfig = getActiveConfig();
  
  if (activeConfig.provider === PROVIDERS.ANTHROPIC) {
    // Appel direct à l'API Anthropic avec gestion correcte des messages
    const systemMessage = messages.find(msg => msg.role === 'system');
    const userMessages = messages.filter(msg => msg.role !== 'system');
    
    // Format pour Anthropic: system séparé + messages user/assistant
    const anthropicMessages = userMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    const requestBody = {
      model: activeConfig.model,
      max_tokens: options.max_tokens || 4000,
      temperature: options.temperature || 0.2,
      messages: anthropicMessages
    };
    
    // Ajouter le system message si présent
    if (systemMessage) {
      requestBody.system = systemMessage.content;
    }
    
    const response = await fetch(`${activeConfig.baseURL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': activeConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }
    
    const data = await response.json();
    
    // Convertir la réponse Anthropic au format OpenAI pour compatibilité
    return {
      choices: [{
        message: {
          content: data.content[0]?.text || '',
          role: 'assistant'
        }
      }],
      usage: data.usage // Ajouter les infos d'usage si disponibles
    };
  } else {
    // Utiliser le client OpenAI pour les autres providers
    const client = getOpenAIClient();
    const requestParams = {
      model: activeConfig.model,
      messages: messages,
      max_tokens: options.max_tokens || 4000,
      temperature: options.temperature || 0.2
    };
    
    // Ajouter le streaming si demandé (pour Ollama principalement)
    if (options.stream) {
      requestParams.stream = true;
    }
    
    return await client.chat.completions.create(requestParams);
  }
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

# IMPORTANT:
- Genere un message de commit pragmatic simple et concis.

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
    const activeConfig = getActiveConfig();
    
    const userPrompt = `Fichiers modifiés: ${files.join(', ')}

Changements:
\`\`\`diff
${diff}
\`\`\``;

    const messages = [
      { role: 'system', content: COMMIT_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    let rawMessage;
    
    // Utiliser le streaming pour Ollama pour voir la génération en temps réel
    if (activeConfig.provider === PROVIDERS.OLLAMA) {
      // console.log(chalk.gray('🌊 Mode streaming activé pour Ollama...'));
      
      let fullResponse = '';
      const stream = await makeAPICall(messages, {
        max_tokens: 2000,
        temperature: 0.3,
        stream: true
      });
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          // Afficher en temps réel pour debug
          process.stdout.write(chalk.dim(content));
        }
      }
      
      console.log('\n'); // Nouvelle ligne après le streaming
      rawMessage = fullResponse.trim();
      
    } else {
      // Mode normal pour OpenAI/OpenRouter/Anthropic
      const response = await makeAPICall(messages, {
        max_tokens: 2000,
        temperature: 0.3
      });
      rawMessage = response.choices[0]?.message?.content?.trim();
    }
    
    if (!rawMessage) {
      throw new Error('Aucun message généré par l\'IA');
    }

    // Traiter les balises de réflexion et afficher le processus si présent
    const message = processThinkingResponse(rawMessage, { showThinking: true, debug: true });
    
    // Debug simplifié
    if (rawMessage.includes('<think>')) {
      console.log(chalk.yellow('🐛 Réflexion détectée, traitement en cours...'));
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
    const userPrompt = `Fichier: ${filePath}

Contenu actuel:
\`\`\`
${fileContent}
\`\`\`

Modification demandée: ${userNeed}

Retourne le code modifié complet.`;

    const response = await makeAPICall([
      { role: 'system', content: CODE_MODIFICATION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ], {
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
    const response = await makeAPICall([
      { role: 'system', content: CODE_REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.3,
      max_tokens: 4000 // Augmenté pour les analyses de lots
    });

    const rawContent = response.choices[0].message.content.trim();
    
    // Traiter les balises de réflexion
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
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

  // Utiliser le system prompt moderne comme evaluateAndContinue
  const systemPrompt = `Tu es un agent IA expert en développement, capable de résoudre des problèmes techniques complexes de manière méthodique et efficace.

<identity>
Tu es un développeur senior expérimenté avec une expertise approfondie en:
- Résolution de bugs et erreurs de compilation
- Analyse de code et détection de problèmes
- Correction d'erreurs d'indentation et de syntaxe
- Utilisation efficace des outils de développement
</identity>

${generateXMLInstructions()}

<critical_rules>
1. 🎯 PRIORITÉ ABSOLUE: Si un message d'erreur contient un chemin complet, utilise ce chemin EXACT
2. 📋 AVANT patch_file: TOUJOURS faire read_file_lines pour connaître le contenu exact de la ligne
3. 📐 Pour erreurs de ligne spécifique: utilise read_file_lines avec LARGE contexte (minimum 10 lignes, recommandé 30+ pour plus de contexte)
4. ❌ JAMAIS de patch_file avec des changements vides ou approximatifs
5. 🔄 ÉVITER les boucles: ne pas répéter les mêmes actions
6. 🎯 EFFICACITÉ: Si la tâche mentionne un fichier précis, l'analyser directement
7. 🚨 INDENTATION CRITIQUE: Dans patch_file, inclure EXACTEMENT les mêmes espaces/tabs que dans le fichier original
8. 📏 UNE LIGNE À LA FOIS: Pour patch_file, change une seule ligne complète, pas des blocs multi-lignes
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

RÉPONDS UNIQUEMENT EN XML VALIDE - PAS DE MARKDOWN:

Pour chaque action nécessaire, utilise ce format:

<tools name="read_file_lines">
  <param name="path" value="fichier.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

<tools name="patch_file">
  <param name="path" value="fichier.ext" />
  <changes>
    <change action="replace" line="15">
      <old>ancien texte</old>
      <new>nouveau texte</new>
    </change>
  </changes>
</tools>

<tools name="run_command">
  <param name="cwd" value="." />
  <param name="timeout" value="5000" />
  <command>npm test</command>
</tools>`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt + memoryPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 2000
    });

    // Afficher les informations sur les tokens
    if (response.usage) {
      console.log(chalk.gray(`📋 Planification - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Traiter les balises de réflexion
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
    try {
      const plan = parseXMLPlan(content);
      return { plan: plan };
    } catch (parseError) {
      throw new Error(`Erreur de parsing XML du plan d'actions: ${parseError.message}`);
    }

  } catch (error) {
    console.log(chalk.red(`❌ Erreur lors de la génération du plan: ${error.message}`));
    throw error;
  }
}

/**
 * Génère la prochaine action après une erreur de parsing JSON
 * Envoie seulement l'erreur et les outils disponibles à l'IA
 */
export async function generateNextActionAfterParsingError(task, previousActions = [], parseError, options = {}) {
  
  const systemPrompt = `Tu es un agent IA expert en développement. Ta précédente réponse XML a échoué lors du parsing.

ERREUR DE PARSING: ${parseError}

⛔ WARNING: REPEATED ERROR - CHANGE STRATEGY!
If you just did the same action that failed, do something DIFFERENT:
- File not found → Search with find or list_directory 
- Patch fails → Re-read the file completely
- Command fails → Try a different approach

${generateXMLInstructions()}

🎯 FORMAT DE RÉPONSE OBLIGATOIRE:

RÉPONDS UNIQUEMENT EN XML VALIDE - AUCUN TEXTE AVANT OU APRÈS LE XML.
⚠️ COMMENCE TOUJOURS PAR < ET TERMINE PAR >
UTILISE UNIQUEMENT UNE SEULE BALISE <tools> POUR L'ACTION SUIVANTE:

🚨 COMMON ERRORS TO AVOID AFTER PARSING ERROR:
❌ tools name="action">  ← WRONG: missing < at start  
✅ <tools name="action"> ← CORRECT: with < at start
❌ <param name="path"="value" />  ← WRONG: incorrect syntax
✅ <param name="path" value="value" />  ← CORRECT: name then value

<tools name="read_file_lines">
  <param name="path" value="fichier.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

⚠️ RÈGLES CRITIQUES POUR LE XML:
- Utilise des attributs pour les paramètres simples
- Utilise des balises enfant pour les contenus longs (query, content, command, message)
- Assure-toi que toutes les balises sont bien fermées
- N'oublie pas les guillemets pour les valeurs d'attributs

🚨 RÈGLES SPÉCIALES POUR PATCH_FILE:
- TOUJOURS lire le fichier avec read_file_lines AVANT de faire un patch
- Dans <old>, copier EXACTEMENT le texte avec l'indentation du fichier (espaces/tabs)
- Changer UNE SEULE ligne à la fois, jamais des blocs multi-lignes
- Si ça échoue, c'est souvent un problème d'espaces : relire le fichier !

EXEMPLE CORRECT:
Si le fichier contient "    const port = 3000;" (avec 4 espaces au début),
utiliser:
<old>    const port = 3000;</old>
<new>    const port = 8080;</new>

PAS:
<old>const port = 3000;</old> ← FAUX: manque l'indentation`;

  // Ajouter le contexte des actions précédentes
  let previousActionsContext = '';
  if (previousActions.length > 0) {
    const lastActions = previousActions.slice(-3); // Garder seulement les 3 dernières
    previousActionsContext = `\n\nActions précédentes:\n${lastActions.map((action, i) => 
      `${i + 1}. ${action.action} - ${action.status || 'completed'}: ${action.result || action.description}`
    ).join('\n')}`;
  }

  const userPrompt = `Tâche: "${task}"${previousActionsContext}

Ta précédente commande JSON a échoué. Génère une nouvelle action valide en JSON strictement conforme au format demandé.`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 800
    });

    // Afficher les informations sur les tokens
    if (response.usage) {
      console.log(chalk.gray(`🔄 Correction JSON - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Traiter les balises de réflexion
    const content = processThinkingResponse(rawContent, { showThinking: false });
    
    // Parser le JSON de correction
    try {
      const parsed = cleanAndParseJSON(content, { 
        debug: options.debug || false, 
        context: "generateNextActionAfterParsingError" 
      });
      
      // Validation basique de la structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error("Structure JSON invalide - objet attendu");
      }
      
      if (!parsed.next_action || !parsed.next_action.action) {
        throw new Error("Structure JSON invalide - next_action.action manquant");
      }
      
      return parsed;
    } catch (parseError) {
      console.log(chalk.red(`❌ Erreur de parsing JSON de correction: ${parseError.message}`));
      throw new Error("Erreur de parsing JSON persistante après correction");
    }

  } catch (error) {
    console.log(chalk.red(`❌ Erreur lors de la génération de l'action de correction: ${error.message}`));
    throw error;
  }
}

/**
 * Génère la prochaine action unique à effectuer (approche itérative)
 */
export async function generateNextAction(task, previousActions = [], options = {}) {

  const systemPrompt = `Tu es un agent IA expert en développement. Tu dois déterminer la PROCHAINE action unique à effectuer pour accomplir la tâche.

<identity>
Tu es un développeur senior expérimenté avec une expertise approfondie en:
- Résolution de bugs et erreurs de compilation
- Analyse de code et détection de problèmes
- Correction d'erreurs d'indentation et de syntaxe
- Utilisation efficace des outils de développement
</identity>

${generateXMLInstructions()}

<critical_rules>
1. 🎯 NE GÉNÈRE QU'UNE SEULE ACTION - pas un plan complet
2. 📋 AVANT patch_file: TOUJOURS faire read_file_lines pour connaître le contenu exact
3. 📝 create_file: path requis, content optionnel (fichier vide par défaut)
4. 🔄 ÉVITER les boucles: ne pas répéter les mêmes actions
5. 🎯 EFFICACITÉ: Prends en compte les actions déjà effectuées
6. 🚨 INDENTATION patch_file: Copier EXACTEMENT les espaces/tabs du fichier original dans <old>
7. 📏 UNE LIGNE patch_file: Changer une seule ligne complète, jamais des blocs multi-lignes
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
- LIMITE patch_file à MAXIMUM 3-4 changements par action (JSON plus court = plus fiable)
- Pour de nombreuses modifications, DIVISE en plusieurs actions patch_file successives
- Sois EFFICACE et DIRECT dans tes choix
- Si une action précédente a ÉCHOUÉ, génère automatiquement une action de CORRECTION (ne demande rien à l'utilisateur)

🔧 GESTION AUTOMATIQUE DES ERREURS:
- "Address already in use" → run_command: "pkill python" ou "lsof -ti:PORT | xargs kill"
- "Permission denied" → run_command avec sudo ou changement de permissions
- "No such file" → create_file ou correction du chemin
- "Module not found" → run_command: "pip install MODULE"

⛔ ANTI-LOOP RULES (VERY IMPORTANT):
- "File not found" for "xxx.js" → Try "xxx.jsx"
- "File not found" again → run_command: find . -name "*name*" -type f
- Fails 3 times in a row → COMPLETELY change strategy
- Patch fails 2 times → STOP and re-read entire file
- NEVER repeat exactly the same action that just failed

🎯 FORMAT DE RÉPONSE OBLIGATOIRE:

RÉPONDS UNIQUEMENT EN XML VALIDE - AUCUN TEXTE AVANT OU APRÈS LE XML.
⚠️ COMMENCE TOUJOURS PAR < ET TERMINE PAR >
UTILISE UNIQUEMENT UNE SEULE BALISE <tools> POUR L'ACTION SUIVANTE:

🚨 COMMON ERRORS FOR ACTIONS:
❌ tools name="action">  ← WRONG: missing < at start  
✅ <tools name="action"> ← CORRECT: with < at start
❌ <param name="path"="value" />  ← WRONG: incorrect syntax
✅ <param name="path" value="value" />  ← CORRECT: name then value
❌ Patch already modified file → RE-READ first with read_file_lines

<tools name="read_file_lines">
  <param name="path" value="fichier.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

OU

<tools name="patch_file">
  <param name="path" value="fichier.ext" />
  <changes>
    <change action="replace" line="15">
      <old>ancien texte exact</old>
      <new>nouveau texte</new>
    </change>
  </changes>
</tools>

OU

<tools name="run_command">
  <param name="cwd" value="." />
  <command>ls -la</command>
</tools>

EXEMPLES COMPLETS:

1. Créer un fichier vide:
<tools name="create_file">
  <param name="path" value="server.log" />
</tools>

2. Créer un fichier avec contenu:
<tools name="create_file">
  <param name="path" value="config.py" />
  <content># Configuration
port = 8000</content>
</tools>

3. Corriger une erreur "Address already in use":
<tools name="run_command">
  <param name="cwd" value="." />
  <command>pkill python</command>
</tools>

⚠️ CRITICAL RULES:
- GENERATE ONLY ONE <tools> TAG - NOT A COMPLETE PLAN
- BEFORE any patch_file: ALWAYS read_file_lines to see EXACT content
- In patch_file: include EXACTLY the indentation (spaces/tabs) from original file
- One line at a time in patch_file, no multi-line blocks
- If patch_file fails, it's often a spacing issue - re-read the file!`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 1000
    });

    // Afficher les informations sur les tokens
    if (response.usage) {
      console.log(chalk.gray(`🔄 Action - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Traiter les balises de réflexion
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
    // Utiliser le parsing XML
    try {
      const action = parseXMLTool(content);
      
      // Validation basique de la structure
      if (!action || !action.action) {
        throw new Error("Structure XML invalide - action manquante");
      }
      
      // Convertir vers le format attendu par le système
      const parsed = {
        next_action: {
          action: action.action,
          params: action.params
        },
        status: "continue"
      };
      
      return parsed;
    } catch (parseError) {
      console.log(chalk.red(`❌ Erreur de parsing XML: ${parseError.message}`));
      console.log(chalk.yellow(`📝 Contenu reçu de l'IA:`));
      console.log(chalk.gray(`"${rawContent}"`));
      
      throw new Error(`Erreur de parsing XML de l'action: ${parseError.message}`);
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
- read_file_lines: {"path": "fichier.ext", "start_line": 1, "end_line": 50} - OBLIGATOIRE: minimum 10 lignes (recommandé 30+ pour plus de contexte)
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

RÉPONDS UNIQUEMENT EN XML VALIDE - PAS DE MARKDOWN, PAS DE BACKTICKS:

Si la tâche est COMPLETE:
<status>complete</status>

Si la tâche doit CONTINUER avec des actions:
<status>continue</status>

<tools name="read_file_lines">
  <param name="path" value="fichier.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

<tools name="patch_file">
  <param name="path" value="fichier.ext" />
  <changes>
    <change action="replace" line="15">
      <old>ancien texte</old>
      <new>nouveau texte</new>
    </change>
  </changes>
</tools>`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 2000
    });

    // Afficher les informations sur les tokens pour evaluateAndContinue
    if (response.usage) {
      console.log(chalk.gray(`🔄 Évaluation - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Traiter les balises de réflexion
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
    try {
      // Extraire le statut
      const statusMatch = content.match(/<status>(complete|continue)<\/status>/);
      const status = statusMatch ? statusMatch[1] : "continue";
      
      if (status === "complete") {
        return { 
          plan: { 
            status: "complete",
            actions: []
          }
        };
      }
      
      // Extraire les actions
      const plan = parseXMLPlan(content);
      return { 
        plan: { 
          status: "continue",
          actions: plan.actions
        }
      };
    } catch (parseError) {
      throw new Error(`Erreur de parsing XML du plan: ${parseError.message}`);
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

  const systemPrompt = `Tu es un agent IA autonome expert en développement. L'utilisateur t'a donné des instructions spécifiques pour corriger ou améliorer ta stratégie.

MISSION: Générer un nouveau plan basé sur les instructions de l'utilisateur.

INSTRUCTIONS UTILISATEUR: "${userInstructions}"

TU DOIS:
- Prendre en compte les instructions spécifiques de l'utilisateur
- Adapter ta stratégie en conséquence  
- Générer des actions concrètes et correctes
- Expliquer comment tu prends en compte les instructions

ACTIONS DISPONIBLES (avec paramètres requis):
- read_file_lines: {"path": "fichier.ext", "start_line": 1, "end_line": 50} - OBLIGATOIRE: minimum 10 lignes (recommandé 30+ pour plus de contexte)
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
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 2000
    });

    // Afficher les informations sur les tokens pour evaluateAndContinue
    if (response.usage) {
      console.log(chalk.gray(`🔄 Évaluation - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Traiter les balises de réflexion
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
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

/**
 * Récupère la liste des modèles disponibles via l'API
 */
export async function fetchAvailableModels() {
  try {
    const client = getOpenAIClient();
    const activeConfig = getActiveConfig();
    
    if (activeConfig.provider === PROVIDERS.OPENAI) {
      // Récupérer les modèles OpenAI via l'API
      const response = await client.models.list();
      
      // Filtrer pour ne garder que les modèles de chat completion
      const chatModels = response.data
        .filter(model => {
          const id = model.id.toLowerCase();
          return (
            id.includes('gpt') && 
            !id.includes('instruct') && 
            !id.includes('embedding') && 
            !id.includes('whisper') &&
            !id.includes('tts') &&
            !id.includes('dall-e') &&
            !id.includes('realtime')
          );
        })
        .map(model => ({
          id: model.id,
          object: model.object,
          created: model.created,
          owned_by: model.owned_by
        }))
        .sort((a, b) => {
          // Trier par préférence: gpt-4o > gpt-4 > gpt-3.5
          const order = ['gpt-4o', 'gpt-4', 'gpt-3.5'];
          const aPrefix = order.find(prefix => a.id.startsWith(prefix)) || 'zzz';
          const bPrefix = order.find(prefix => b.id.startsWith(prefix)) || 'zzz';
          
          if (aPrefix !== bPrefix) {
            return order.indexOf(aPrefix) - order.indexOf(bPrefix);
          }
          
          return a.id.localeCompare(b.id);
        });
      
      return {
        provider: PROVIDERS.OPENAI,
        models: chatModels
      };
      
    } else if (activeConfig.provider === PROVIDERS.OPENROUTER) {
      // Pour OpenRouter, utiliser l'API des modèles
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${activeConfig.apiKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const models = data.data
        .filter(model => model.id && !model.id.includes('moderation'))
        .map(model => ({
          id: model.id,
          name: model.name || model.id,
          description: model.description,
          context_length: model.context_length,
          pricing: model.pricing
        }))
        .sort((a, b) => {
          // Trier par popularité/qualité
          const popularModels = ['openai/gpt-4o', 'openai/gpt-4', 'anthropic/claude-3', 'meta-llama/llama-3'];
          const aPopular = popularModels.some(prefix => a.id.startsWith(prefix));
          const bPopular = popularModels.some(prefix => b.id.startsWith(prefix));
          
          if (aPopular && !bPopular) return -1;
          if (!aPopular && bPopular) return 1;
          
          return a.name.localeCompare(b.name);
        });
      
      return {
        provider: PROVIDERS.OPENROUTER,
        models: models
      };
      
    } else if (activeConfig.provider === PROVIDERS.OLLAMA) {
      // Pour Ollama, utiliser l'endpoint /api/tags
      const baseURL = activeConfig.baseURL.replace('/v1', '');
      const response = await fetch(`${baseURL}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      const models = data.models.map(model => ({
        id: model.name,
        name: model.name,
        size: model.size,
        modified_at: model.modified_at,
        family: model.details?.family || 'Unknown',
        digest: model.digest
      }))
      .sort((a, b) => {
        // Trier par date de modification (plus récent en premier)
        if (a.modified_at && b.modified_at) {
          return new Date(b.modified_at) - new Date(a.modified_at);
        }
        return a.name.localeCompare(b.name);
      });
      
      return {
        provider: PROVIDERS.OLLAMA,
        models: models
      };
      
    } else if (activeConfig.provider === PROVIDERS.ANTHROPIC) {
      // Pour Anthropic, utiliser une liste de modèles réellement disponibles
      // Anthropic ne fournit pas d'endpoint public pour lister tous les modèles
      const popularModels = [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Most intelligent model, ideal for complex tasks',
          context_length: 200000,
          created: '2024-10-22T00:00:00Z'
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          description: 'Fastest model, great for simple tasks and quick responses',
          context_length: 200000,
          created: '2024-10-22T00:00:00Z'
        },
        {
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          description: 'Most powerful model for highly complex tasks',
          context_length: 200000,
          created: '2024-02-29T00:00:00Z'
        },
        {
          id: 'claude-3-sonnet-20240229',
          name: 'Claude 3 Sonnet',
          description: 'Balance of intelligence and speed',
          context_length: 200000,
          created: '2024-02-29T00:00:00Z'
        },
        {
          id: 'claude-3-haiku-20240307',
          name: 'Claude 3 Haiku',
          description: 'Fast and cost-effective',
          context_length: 200000,
          created: '2024-03-07T00:00:00Z'
        }
      ];
      
      // Optionnel: vérifier la disponibilité des modèles via l'API
      const availableModels = [];
      for (const model of popularModels) {
        try {
          // Tenter de récupérer les informations du modèle pour vérifier sa disponibilité
          const response = await fetch(`${activeConfig.baseURL}/v1/models/${model.id}`, {
            headers: {
              'x-api-key': activeConfig.apiKey,
              'anthropic-version': '2023-06-01'
            }
          });
          
          if (response.ok) {
            const modelData = await response.json();
            availableModels.push({
              id: modelData.id,
              name: modelData.display_name || model.name,
              description: model.description,
              context_length: model.context_length,
              created: modelData.created_at || model.created,
              type: modelData.type || 'model'
            });
          } else {
            // Si le modèle n'est pas accessible, l'ajouter quand même à la liste
            availableModels.push(model);
          }
        } catch (error) {
          // En cas d'erreur, ajouter le modèle à la liste par défaut
          availableModels.push(model);
        }
      }
      
      return {
        provider: PROVIDERS.ANTHROPIC,
        models: availableModels
      };
    }
    
    throw new Error('Provider non supporté pour la récupération de modèles');
    
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
    } else if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      const activeConfig = getActiveConfig();
      if (activeConfig.provider === PROVIDERS.OLLAMA) {
        throw new Error('Impossible de se connecter à Ollama. Vérifiez qu\'Ollama est démarré avec "ollama serve"');
      }
      throw new Error('Impossible de se connecter au service');
    } else {
      throw new Error(`Erreur lors de la récupération des modèles: ${error.message}`);
    }
  }
}

/**
 * Récupère les informations détaillées d'un modèle spécifique
 */
export async function fetchModelInfo(modelId) {
  try {
    const client = getOpenAIClient();
    const activeConfig = getActiveConfig();
    
    if (activeConfig.provider === PROVIDERS.OPENAI) {
      // Récupérer les infos du modèle OpenAI
      const model = await client.models.retrieve(modelId);
      
      return {
        id: model.id,
        object: model.object,
        created: model.created,
        owned_by: model.owned_by,
        provider: PROVIDERS.OPENAI
      };
      
    } else if (activeConfig.provider === PROVIDERS.OPENROUTER) {
      // Pour OpenRouter, chercher dans la liste des modèles
      const modelsData = await fetchAvailableModels();
      const model = modelsData.models.find(m => m.id === modelId);
      
      return model || null;
      
    } else if (activeConfig.provider === PROVIDERS.OLLAMA) {
      // Pour Ollama, utiliser l'endpoint /api/show
      const baseURL = activeConfig.baseURL.replace('/v1', '');
      const response = await fetch(`${baseURL}/api/show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: modelId })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        id: data.modelfile || modelId,
        name: modelId,
        details: data.details,
        parameters: data.parameters,
        template: data.template,
        provider: PROVIDERS.OLLAMA
      };
    }
    
    throw new Error('Provider non supporté pour la récupération d\'informations de modèle');
    
  } catch (error) {
    if (error.message.includes('model not found') || error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Récupère la liste des modèles disponibles avec une clé API spécifique (pour la configuration)
 * @param {string} provider - Le provider (PROVIDERS.OPENAI, PROVIDERS.ANTHROPIC, etc.)
 * @param {string} apiKey - La clé API à utiliser
 */
export async function fetchAvailableModelsWithKey(provider, apiKey) {
  if (provider === PROVIDERS.ANTHROPIC) {
    // Pour Anthropic, utiliser la liste de modèles réellement disponibles avec validation
    const popularModels = [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Most intelligent model, ideal for complex tasks',
        context_length: 200000,
        created: '2024-10-22T00:00:00Z'
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fastest model, great for simple tasks and quick responses',
        context_length: 200000,
        created: '2024-10-22T00:00:00Z'
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most powerful model for highly complex tasks',
        context_length: 200000,
        created: '2024-02-29T00:00:00Z'
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: 'Balance of intelligence and speed',
        context_length: 200000,
        created: '2024-02-29T00:00:00Z'
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fast and cost-effective',
        context_length: 200000,
        created: '2024-03-07T00:00:00Z'
      }
    ];
    
    // Tester la clé API avec le premier modèle pour valider l'accès
    try {
      const testResponse = await fetch(`https://api.anthropic.com/v1/models/${popularModels[0].id}`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      
      if (testResponse.ok) {
        console.log(chalk.green('✅ Clé API Anthropic validée avec succès'));
      } else if (testResponse.status === 401) {
        throw new Error('Clé API invalide ou expirée');
      } else if (testResponse.status === 403) {
        throw new Error('Accès refusé - vérifiez vos permissions');
      }
    } catch (error) {
      if (error.message.includes('Clé API invalide')) {
        throw error;
      }
      // En cas d'erreur réseau, continuer quand même avec la liste
      console.log(chalk.yellow('⚠️  Impossible de valider la clé API, mais utilisation de la liste par défaut'));
    }
    
    return {
      provider: PROVIDERS.ANTHROPIC,
      models: popularModels
    };
  }
  
  // Pour les autres providers, utiliser la logique existante
  throw new Error(`fetchAvailableModelsWithKey non implémenté pour le provider: ${provider}`);
} 

/**
 * Fonction robuste pour nettoyer et parser du JSON avec diagnostics détaillés
 * @param {string} content - Le contenu à parser
 * @param {Object} options - Options de debug
 * @returns {Object} - L'objet parsé ou throw une erreur détaillée
 */
function cleanAndParseJSON(content, options = {}) {
  const { debug = false, context = "unknown" } = options;
  
  if (debug) {
    console.log(chalk.gray(`🔍 Debug JSON parsing pour ${context}:`));
    console.log(chalk.gray(`   Content brut (${content.length} chars): "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"`));
  }
  
  // Stratégie 1: Essayer le parsing direct
  try {
    const parsed = JSON.parse(content);
    if (debug) console.log(chalk.green(`   ✅ Parsing direct réussi`));
    return parsed;
  } catch (directError) {
    if (debug) console.log(chalk.yellow(`   ⚠️ Parsing direct échoué: ${directError.message}`));
  }
  
  // Stratégie 2: Chercher et extraire le JSON principal
  const jsonPatterns = [
    // JSON complet avec accolades
    /\{[\s\S]*\}/,
    // JSON avec possibles caractères avant/après
    /.*?(\{[\s\S]*\}).*?/,
    // JSON multiligne avec espaces
    /\n\s*(\{[\s\S]*\})\s*\n?/,
    // JSON avec backticks markdown
    /```(?:json)?\s*(\{[\s\S]*\})\s*```/i,
    // JSON avec balises de code
    /<code[^>]*>(\{[\s\S]*\})<\/code>/i
  ];
  
  for (let i = 0; i < jsonPatterns.length; i++) {
    const pattern = jsonPatterns[i];
    const match = content.match(pattern);
    
    if (match) {
      const extractedJson = match[1] || match[0];
      if (debug) console.log(chalk.gray(`   🔄 Tentative pattern ${i + 1}: "${extractedJson.substring(0, 100)}..."`));
      
      try {
        const parsed = JSON.parse(extractedJson);
        if (debug) console.log(chalk.green(`   ✅ Pattern ${i + 1} réussi`));
        return parsed;
      } catch (patternError) {
        if (debug) console.log(chalk.yellow(`   ⚠️ Pattern ${i + 1} échoué: ${patternError.message}`));
      }
    }
  }
  
  // Stratégie 3: Nettoyage agressif et réparation des JSON tronqués
  let cleanedContent = content
    // Supprimer les backticks markdown
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    // Supprimer les balises HTML/XML
    .replace(/<[^>]*>/g, '')
    // Supprimer les commentaires JavaScript/JSON5
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // Gérer les apostrophes françaises AVANT de remplacer toutes les quotes
    .replace(/([a-zA-Z])'([a-zA-Z])/g, '$1\u2019$2') // Remplacer l'apostrophe par un caractère Unicode
    // Normaliser les guillemets
    .replace(/'/g, '"')
    // Restaurer les apostrophes française
    .replace(/\u2019/g, "'")
    // Supprimer les caractères de contrôle sauf \n, \r, \t
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Supprimer les espaces en début/fin
    .trim();
  
  // Stratégie 3.1: Réparer les JSON tronqués
  if (cleanedContent.endsWith(',') || cleanedContent.endsWith('"') || !cleanedContent.endsWith('}')) {
    if (debug) console.log(chalk.gray(`   🔧 Tentative de réparation d'un JSON tronqué`));
    
    // Chercher la dernière structure complète
    let depth = 0;
    let lastCompleteIndex = -1;
    let inString = false;
    let escaped = false;
    
    for (let i = cleanedContent.length - 1; i >= 0; i--) {
      const char = cleanedContent[i];
      
      if (!inString) {
        if (char === '}') depth++;
        else if (char === '{') depth--;
        
        if (depth === 0 && char === '}') {
          lastCompleteIndex = i;
          break;
        }
      }
      
      if (char === '"' && !escaped) {
        inString = !inString;
      }
      escaped = (char === '\\' && !escaped);
    }
    
    if (lastCompleteIndex > 0) {
      const repairedContent = cleanedContent.substring(0, lastCompleteIndex + 1);
      if (debug) console.log(chalk.gray(`   🔧 JSON réparé (tronqué à ${lastCompleteIndex + 1}/${cleanedContent.length})`));
      cleanedContent = repairedContent;
    }
  }
  
  if (debug) console.log(chalk.gray(`   🧹 Contenu nettoyé: "${cleanedContent.substring(0, 200)}..."`));
  
  try {
    const parsed = JSON.parse(cleanedContent);
    if (debug) console.log(chalk.green(`   ✅ Nettoyage agressif réussi`));
    return parsed;
  } catch (cleanError) {
    if (debug) console.log(chalk.yellow(`   ⚠️ Nettoyage agressif échoué: ${cleanError.message}`));
  }
  
  // Stratégie 4: Extraire champ par champ si possible
  try {
    const fields = {};
    
    // Chercher les champs individuellement avec patterns améliorés
    const fieldPatterns = {
      analysis: /"analysis"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/,
      next_action: /"next_action"\s*:\s*(\{[\s\S]*?\})\s*(?:,|\}|$)/,
      status: /"status"\s*:\s*"([^"]*)"/ 
    };
    
         let foundFields = 0;
     for (const [field, pattern] of Object.entries(fieldPatterns)) {
       const match = content.match(pattern);
       if (match) {
         try {
           if (field === 'next_action') {
             // Nettoyer l'objet next_action avant parsing
             let actionJson = match[1];
             
             // Réparer les objets next_action tronqués en cherchant les patterns d'action
             if (!actionJson.includes('"action"') && content.includes('"action"')) {
               // Extraire directement les composants de l'action
               const actionMatch = content.match(/"action"\s*:\s*"([^"]+)"/);
               const descMatch = content.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
               const paramsMatch = content.match(/"params"\s*:\s*(\{[\s\S]*?\})/);
               
               if (actionMatch) {
                 const reconstructed = {
                   action: actionMatch[1],
                   description: descMatch ? descMatch[1] : "Action reconstruite",
                   params: {}
                 };
                 
                 if (paramsMatch) {
                   try {
                     reconstructed.params = JSON.parse(paramsMatch[1]);
                   } catch (paramError) {
                     // Garder params vide si parsing échoue
                   }
                 }
                 
                 fields[field] = reconstructed;
                 foundFields++;
                 if (debug) console.log(chalk.cyan(`   🔧 Champ ${field} reconstruit: ${JSON.stringify(fields[field]).substring(0, 50)}...`));
                 continue;
               }
             }
             
             fields[field] = JSON.parse(actionJson);
           } else {
             fields[field] = match[1];
           }
           foundFields++;
           if (debug) console.log(chalk.gray(`   🔧 Champ ${field} extrait: ${JSON.stringify(fields[field]).substring(0, 50)}...`));
         } catch (fieldError) {
           if (debug) console.log(chalk.yellow(`   ⚠️ Extraction du champ ${field} échouée: ${fieldError.message}`));
         }
       }
     }
    
    if (foundFields > 0) {
      if (debug) console.log(chalk.green(`   ✅ Extraction par champs réussie (${foundFields} champs)`));
      return fields;
    }
  } catch (extractError) {
    if (debug) console.log(chalk.yellow(`   ⚠️ Extraction par champs échouée: ${extractError.message}`));
  }
  
  // Stratégie 5: Fallback avec structure minimale
  if (debug) {
    console.log(chalk.red(`   ❌ Toutes les stratégies ont échoué`));
    console.log(chalk.gray(`   📝 Contenu problématique:`));
    console.log(chalk.gray(`   "${content}"`));
  }
  
  // Si rien n'a fonctionné, essayer de créer une structure minimale
  const hasAction = content.toLowerCase().includes('patch_file') || 
                   content.toLowerCase().includes('read_file') ||
                   content.toLowerCase().includes('create_file') ||
                   content.toLowerCase().includes('run_command');
                   
  if (hasAction) {
    // Essayer de deviner l'action principale et extraire plus d'infos
    let guessedAction = 'read_file_lines';
    let extractedParams = {};
    let extractedDescription = "Action reconstruite après erreur de parsing";
    
    if (content.includes('patch_file')) {
      guessedAction = 'patch_file';
      // Essayer d'extraire le path
      const pathMatch = content.match(/"path"\s*:\s*"([^"]+)"/);
      if (pathMatch) {
        extractedParams.path = pathMatch[1];
        extractedDescription = `Patch du fichier ${pathMatch[1]} (simplifié après erreur JSON)`;
      }
      
      // Créer des changements minimaux pour éviter les erreurs
      extractedParams.changes = [{
        action: "replace",
        line: 1,
        old: "// Placeholder",
        new: "// Patch reconstruit - vérifiez le contenu"
      }];
      
    } else if (content.includes('create_file')) {
      guessedAction = 'create_file';
      const pathMatch = content.match(/"path"\s*:\s*"([^"]+)"/);
      if (pathMatch) {
        extractedParams.path = pathMatch[1];
        extractedDescription = `Création du fichier ${pathMatch[1]} (simplifié après erreur JSON)`;
      }
    } else if (content.includes('run_command')) {
      guessedAction = 'run_command';
      const cmdMatch = content.match(/"command"\s*:\s*"([^"]+)"/);
      if (cmdMatch) {
        extractedParams.command = cmdMatch[1];
        extractedDescription = `Exécution: ${cmdMatch[1]} (simplifié après erreur JSON)`;
      }
    }
    
    const fallbackStructure = {
      analysis: "Erreur de parsing JSON - structure reconstruite avec infos partielles",
      next_action: {
        action: guessedAction,
        description: extractedDescription,
        params: extractedParams
      },
      status: "continue"
    };
    
    if (debug) console.log(chalk.cyan(`   🔄 Fallback avec structure enrichie pour ${guessedAction}: ${JSON.stringify(extractedParams)}`));
    return fallbackStructure;
  }
  
  throw new Error(`Impossible de parser le JSON après toutes les stratégies de nettoyage. Contenu: ${content.substring(0, 200)}...`);
}