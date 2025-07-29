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
 * System prompt for generating commit messages
 */
const COMMIT_SYSTEM_PROMPT = `You are an expert in Git commit messages. Your task is to generate a clear, concise and descriptive commit message based on the provided changes.

Rules for commit message:
1. Use conventional format: <type>(<scope>): <description>
2. Accepted types: feat, fix, docs, style, refactor, test, chore, ci, build, perf
3. Scope is optional but recommended
4. Description should be in French, present tense, and start with a verb
5. Maximum 50 characters for the first line
6. If necessary, add a more detailed description after a blank line
7. Be precise about what was modified/added/removed

Examples:
- feat(auth): ajoute l'authentification OAuth
- fix(api): corrige la validation des données utilisateur
- refactor(utils): simplifie la logique de formatage
- docs(readme): met à jour les instructions d'installation

# IMPORTANT:
- Generate a pragmatic simple and concise commit message.

Generate only the commit message, without additional explanation.`;

/**
 * System prompt for modifying files
 */
const CODE_MODIFICATION_SYSTEM_PROMPT = `You are an expert developer who helps modify code according to user-specified needs.

IMPORTANT RULES:
1. You must return ONLY the complete modified code, without explanation
2. Keep exactly the same structure and indentation as the original file
3. Only modify what is necessary to respond to the request
4. Respect the existing code style
5. Make sure the code remains functional
6. If you add imports, place them in the right place
7. Preserve all existing comments unless explicitly asked to modify them
8. Do NOT return markdown, triple backticks, or explanations

IMPORTANT: Your response must be the exact content of the modified file, ready to be saved directly.`;

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
 * System prompt for code analysis and bug detection
 */
const CODE_REVIEW_SYSTEM_PROMPT = `You are a senior expert developer who performs code reviews to detect bugs, security issues, and suggest improvements.

ANALYSIS TO PERFORM:
1. Detection of potential bugs (logical errors, missing conditions, null/undefined)
2. Security issues (injections, missing validation, sensitive data)
3. Performance issues (inefficient loops, expensive operations)
4. Best practices (naming, structure, readability)
5. Missing or insufficient error handling

${generateXMLInstructions()}

RESPONSE FORMAT:
RESPOND ONLY IN VALID XML - NO MARKDOWN:

<analysis>
  <summary>Global summary of problems found</summary>
  <issues>
    <issue>
      <type>bug|security|performance|style|error-handling</type>
      <severity>critical|high|medium|low</severity>
      <title>Short problem title</title>
      <description>Detailed problem description</description>
      <suggestion>Correction suggestion</suggestion>
      <file>concerned file name (REQUIRED)</file>
      <line>approximate line number (optional)</line>
      <code_example>corrected code example (optional)</code_example>
    </issue>
  </issues>
  <recommendations>
    <recommendation>General recommendation 1</recommendation>
    <recommendation>General recommendation 2</recommendation>
  </recommendations>
</analysis>

IMPORTANT: 
- Be precise and constructive
- Focus on real problems, not minor style preferences
- Provide concrete and achievable suggestions
- MANDATORY: For each problem, ALWAYS indicate the concerned file in the "file" field
- If no problems are found, return empty "issues" section`;

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

  let userPrompt = `Analyze these files to detect bugs and potential issues:`;

  if (commitInfo) {
    userPrompt += `

COMMIT: ${commitInfo.short} - ${commitInfo.subject}
AUTHOR: ${commitInfo.author}`;
  }

  userPrompt += `

FILES TO ANALYZE:`;

  // Add each file
  files.forEach((file, index) => {
    userPrompt += `

=== FILE ${index + 1}: ${file.path} ===
\`\`\`
${file.content}
\`\`\``;
  });

  userPrompt += `

SPECIAL INSTRUCTIONS:
- Analyze each file individually AND the relationships between them
- Detect issues that may affect multiple files
- For each issue, clearly indicate the concerned file
- Group recommendations that apply to multiple files`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: CODE_REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.3,
      max_tokens: 4000 // Increased for batch analyses
    });

    const rawContent = response.choices[0].message.content.trim();
    
    // Process thinking tags
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
    try {
      // Parse XML analysis response
      const analysisMatch = content.match(/<analysis>([\s\S]*?)<\/analysis>/);
      if (!analysisMatch) {
        throw new Error("No analysis XML structure found");
      }

      const analysisContent = analysisMatch[1];
      
      // Extract summary
      const summaryMatch = analysisContent.match(/<summary>([\s\S]*?)<\/summary>/);
      const summary = summaryMatch ? summaryMatch[1].trim() : "Analysis completed";
      
      // Extract issues
      const issues = [];
      const issuesMatch = analysisContent.match(/<issues>([\s\S]*?)<\/issues>/);
      if (issuesMatch) {
        const issueMatches = issuesMatch[1].matchAll(/<issue>([\s\S]*?)<\/issue>/g);
        
        for (const issueMatch of issueMatches) {
          const issueContent = issueMatch[1];
          
          const typeMatch = issueContent.match(/<type>([\s\S]*?)<\/type>/);
          const severityMatch = issueContent.match(/<severity>([\s\S]*?)<\/severity>/);
          const titleMatch = issueContent.match(/<title>([\s\S]*?)<\/title>/);
          const descriptionMatch = issueContent.match(/<description>([\s\S]*?)<\/description>/);
          const suggestionMatch = issueContent.match(/<suggestion>([\s\S]*?)<\/suggestion>/);
          const fileMatch = issueContent.match(/<file>([\s\S]*?)<\/file>/);
          const lineMatch = issueContent.match(/<line>([\s\S]*?)<\/line>/);
          const codeExampleMatch = issueContent.match(/<code_example>([\s\S]*?)<\/code_example>/);
          
          const issue = {
            type: typeMatch ? typeMatch[1].trim() : "unknown",
            severity: severityMatch ? severityMatch[1].trim() : "medium",
            title: titleMatch ? titleMatch[1].trim() : "Issue found",
            description: descriptionMatch ? descriptionMatch[1].trim() : "",
            suggestion: suggestionMatch ? suggestionMatch[1].trim() : "",
            file: fileMatch ? fileMatch[1].trim() : "unknown"
          };
          
          if (lineMatch) issue.line = lineMatch[1].trim();
          if (codeExampleMatch) issue.code_example = codeExampleMatch[1].trim();
          
          issues.push(issue);
        }
      }
      
      // Extract recommendations
      const recommendations = [];
      const recommendationsMatch = analysisContent.match(/<recommendations>([\s\S]*?)<\/recommendations>/);
      if (recommendationsMatch) {
        const recMatches = recommendationsMatch[1].matchAll(/<recommendation>([\s\S]*?)<\/recommendation>/g);
        
        for (const recMatch of recMatches) {
          recommendations.push(recMatch[1].trim());
        }
      }
      
      return {
        summary,
        issues,
        recommendations
      };
    } catch (parseError) {
      // If XML is malformed, return basic structure
      return {
        summary: "Error during analysis: malformed response",
        issues: [],
        recommendations: ["Retry the analysis"]
      };
    }

  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Invalid API key. Check your configuration with "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Insufficient quota. Check your account');
    } else if (error.message.includes('not configured')) {
      throw new Error('API key not configured. Use "tera config" to configure it');
    } else if (error.status === 401) {
      throw new Error('Invalid or expired API key. Check your configuration with "tera config"');
    } else if (error.status === 429) {
      throw new Error('Request limit reached. Wait a moment before retrying');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Model "${activeConfig.model}" not found. Check your configuration with "tera config"`);
    } else {
      throw new Error(`AI Error: ${error.message}`);
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

  // Use modern system prompt like evaluateAndContinue
  const systemPrompt = `You are an expert AI development agent, capable of solving complex technical problems in a methodical and efficient manner.

<identity>
You are an experienced senior developer with deep expertise in:
- Bug resolution and compilation errors
- Code analysis and problem detection
- Indentation and syntax error correction
- Efficient use of development tools
</identity>

${generateXMLInstructions()}

<critical_rules>
1. 🎯 ABSOLUTE PRIORITY: If an error message contains a full path, use that EXACT path
2. 📋 BEFORE patch_file: ALWAYS do read_file_lines to know the exact line content
3. 📐 For specific line errors: use read_file_lines with LARGE context (minimum 10 lines, recommended 30+ for more context)
4. ❌ NEVER patch_file with empty or approximate changes
5. 🔄 AVOID loops: don't repeat the same actions
6. 🎯 EFFICIENCY: If the task mentions a specific file, analyze it directly
7. 🚨 CRITICAL INDENTATION: In patch_file, include EXACTLY the same spaces/tabs as in the original file
8. 📏 ONE LINE AT A TIME: For patch_file, change one complete line, not multi-line blocks
</critical_rules>

<error_handling_expertise>
- IndentationError: Always analyze at least 50 lines around the error to see the complete structure
- File not found: Use the COMPLETE path from the error, not just the file name
- Syntax errors: Analyze the broad context to understand the code structure
</error_handling_expertise>`;

  // Add memory context if available
  let memoryPrompt = '';
  if (options.memory && options.memory.hasContext) {
    memoryPrompt = `

🧠 PERSISTENT MEMORY AVAILABLE:

${options.memory.similarEpisodes?.length > 0 ? `SIMILAR PAST EPISODES:
${options.memory.similarEpisodes.map(ep => 
  `- ${ep.timestamp.split('T')[0]}: "${ep.task}" (${ep.success ? '✅ success' : '❌ failure'})`
).join('\n')}

LESSONS LEARNED:
${options.memory.similarEpisodes.map(ep => {
  if (ep.errors && ep.errors.length > 0) {
    return `- Recurring error: ${ep.errors[0]}`;
  }
  return `- Successful approach: ${ep.actions?.[0]?.action || 'N/A'}`;
}).join('\n')}
` : ''}

${options.memory.recurringErrors?.length > 0 ? `⚠️ RECURRING ERRORS DETECTED:
${options.memory.recurringErrors.map(err => 
  `- "${err.error}" (${err.count} times) - AVOID reproducing this error!`
).join('\n')}
` : ''}

${Object.keys(options.memory.relevantPatterns || {}).length > 0 ? `💡 KNOWN SOLUTIONS:
${Object.entries(options.memory.relevantPatterns).map(([pattern, solution]) => 
  `- ${pattern}: ${solution.solution || solution}`
).join('\n')}
` : ''}

USE this memory to be more efficient and avoid past errors!`;
  }

  const userPrompt = `Task: "${task}"

Generate a COMPLETE action plan to fully accomplish the task. Plan ALL necessary steps:
1. If you need to read files - include read_file_lines actions
2. If you need to modify files - include patch_file actions  
3. If you need to create files - include create_file actions
4. If you need to test - include run_command actions

OBJECTIVE: Generate a complete plan that will accomplish the task in one execution, not just the first step.

RESPOND ONLY IN VALID XML - NO MARKDOWN:

For each necessary action, use this format:

<tools name="read_file_lines">
  <param name="path" value="file.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

<tools name="patch_file">
  <param name="path" value="file.ext" />
  <changes>
    <change action="replace" line="15">
      <old>old text</old>
      <new>new text</new>
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
 * Generates the next action after an XML parsing error
 * Sends only the error and available tools to the AI
 */
export async function generateNextActionAfterParsingError(task, previousActions = [], parseError, options = {}) {
  
  const systemPrompt = `You are an expert AI development agent. Your previous XML response failed during parsing.

PARSING ERROR: ${parseError}

⛔ WARNING: REPEATED ERROR - CHANGE STRATEGY!
If you just did the same action that failed, do something DIFFERENT:
- File not found → Search with find or list_directory 
- Patch fails → Re-read the file completely
- Command fails → Try a different approach

${generateXMLInstructions()}

🎯 MANDATORY RESPONSE FORMAT:

RESPOND ONLY IN VALID XML - NO TEXT BEFORE OR AFTER THE XML.
⚠️ ALWAYS START WITH < AND END WITH >
USE ONLY ONE <tools> TAG FOR THE NEXT ACTION:

🚨 COMMON ERRORS TO AVOID AFTER PARSING ERROR:
❌ tools name="action">  ← WRONG: missing < at start  
✅ <tools name="action"> ← CORRECT: with < at start
❌ <param name="path"="value" />  ← WRONG: incorrect syntax
✅ <param name="path" value="value" />  ← CORRECT: name then value

<tools name="read_file_lines">
  <param name="path" value="file.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

⚠️ CRITICAL XML RULES:
- Use attributes for simple parameters
- Use child tags for long content (query, content, command, message)
- Make sure all tags are properly closed
- Don't forget quotes for attribute values

🚨 SPECIAL RULES FOR PATCH_FILE:
- ALWAYS read the file with read_file_lines BEFORE doing a patch
- In <old>, copy EXACTLY the text with indentation from the file (spaces/tabs)
- Change ONE line at a time, never multi-line blocks
- If it fails, it's often a spacing issue: re-read the file!

CORRECT EXAMPLE:
If file contains "    const port = 3000;" (with 4 spaces at beginning),
use:
<old>    const port = 3000;</old>
<new>    const port = 8080;</new>

NOT:
<old>const port = 3000;</old> ← WRONG: missing indentation`;

  // Add context of previous actions
  let previousActionsContext = '';
  if (previousActions.length > 0) {
    const lastActions = previousActions.slice(-3); // Keep only last 3
    previousActionsContext = `\n\nPrevious actions:\n${lastActions.map((action, i) => 
      `${i + 1}. ${action.action} - ${action.status || 'completed'}: ${action.result || action.description}`
    ).join('\n')}`;
  }

  const userPrompt = `Task: "${task}"${previousActionsContext}

Your previous XML command failed. Generate a new valid action in XML strictly conforming to the requested format.`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 800
    });

    // Display token information
    if (response.usage) {
      console.log(chalk.gray(`🔄 XML Correction - Tokens: Sent ${response.usage.prompt_tokens} | Received ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Process thinking tags
    const content = processThinkingResponse(rawContent, { showThinking: false });
    
    // Parse the XML correction
    try {
      const action = parseXMLTool(content);
      
      // Basic structure validation
      if (!action || !action.action) {
        throw new Error("Invalid XML structure - action missing");
      }
      
      // Convert to format expected by the system
      const parsed = {
        next_action: {
          action: action.action,
          params: action.params
        },
        status: "continue"
      };
      
      return parsed;
    } catch (parseError) {
      console.log(chalk.red(`❌ XML parsing error: ${parseError.message}`));
      throw new Error("Persistent XML parsing error after correction");
    }

  } catch (error) {
    console.log(chalk.red(`❌ Error generating correction action: ${error.message}`));
    throw error;
  }
}

/**
 * Generates the next unique action to perform (iterative approach)
 */
export async function generateNextAction(task, previousActions = [], options = {}) {

  const systemPrompt = `You are an expert AI development agent. You must determine the NEXT unique action to perform to accomplish the task.

<identity>
You are an experienced senior developer with deep expertise in:
- Bug resolution and compilation errors
- Code analysis and problem detection
- Indentation and syntax error correction
- Efficient use of development tools
</identity>

${generateXMLInstructions()}

<critical_rules>
1. 🎯 GENERATE ONLY ONE ACTION - not a complete plan
2. 📋 BEFORE patch_file: ALWAYS do read_file_lines to know the exact content
3. 📝 create_file: path required, content optional (empty file by default)
4. 🔄 AVOID loops: don't repeat the same actions
5. 🎯 EFFICIENCY: Take into account actions already performed
6. 🚨 INDENTATION patch_file: Copy EXACTLY the spaces/tabs from the original file in <old>
7. 📏 ONE LINE patch_file: Change one complete line, never multi-line blocks
</critical_rules>`;

  // Add context of previous actions
  let previousActionsContext = '';
  if (previousActions.length > 0) {
    previousActionsContext = `

📋 ACTIONS ALREADY PERFORMED:
${previousActions.map((action, index) => 
  `${index + 1}. ${action.description} (${action.status})`
).join('\n')}

${previousActions.filter(a => a.result).length > 0 ? `📤 COMPLETE RESULTS OF PREVIOUS ACTIONS:
${previousActions.filter(a => a.result).slice(-3).map(action => 
  `- ${action.description}:
${action.result}`
).join('\n\n')}` : ''}

🚨 ANTI-REPETITION RULES:
${previousActions.some(a => a.action === 'list_directory') ? '- You already listed directory content - DON\'T DO IT AGAIN!' : ''}
${previousActions.filter(a => a.action === 'read_file_lines').map(a => a.params?.path).filter(Boolean).length > 0 ? `- You already read these files: ${[...new Set(previousActions.filter(a => a.action === 'read_file_lines').map(a => a.params?.path).filter(Boolean))].join(', ')} - DON\'T READ THEM AGAIN!` : ''}

🔥 AUTOMATIC ERROR HANDLING:
${previousActions.some(a => a.status === 'failed' && a.error?.includes('Address already in use')) ? '- ERROR "Address already in use" detected → Generate command to kill existing process (ex: "pkill python" or "lsof -ti:8000 | xargs kill")' : ''}
${previousActions.some(a => a.status === 'failed' && a.error?.includes('Permission denied')) ? '- ERROR "Permission denied" detected → Generate command with sudo or change permissions' : ''}
${previousActions.some(a => a.status === 'failed' && a.error?.includes('No such file')) ? '- ERROR "No such file" detected → Check exact path or create missing file' : ''}`;
  }

  const userPrompt = `Task: "${task}"
${previousActionsContext}

ANALYZE the current situation and determine the NEXT unique action to perform.

🎯 CRITICAL INSTRUCTIONS:
- USE results from previous actions to advance intelligently
- NEVER REPEAT an action already done (especially list_directory or read_file_lines)
- If you have the necessary information, TAKE ACTION (create_file, patch_file, etc.)
- LIMIT patch_file to MAXIMUM 3-4 changes per action (shorter XML = more reliable)
- For many modifications, DIVIDE into multiple successive patch_file actions
- Be EFFICIENT and DIRECT in your choices
- If a previous action FAILED, automatically generate a CORRECTION action (don't ask user anything)

🔧 AUTOMATIC ERROR HANDLING:
- "Address already in use" → run_command: "pkill python" or "lsof -ti:PORT | xargs kill"
- "Permission denied" → run_command with sudo or permission change
- "No such file" → create_file or path correction
- "Module not found" → run_command: "pip install MODULE"

⛔ ANTI-LOOP RULES (VERY IMPORTANT):
- "File not found" for "xxx.js" → Try "xxx.jsx"
- "File not found" again → run_command: find . -name "*name*" -type f
- Fails 3 times in a row → COMPLETELY change strategy
- Patch fails 2 times → STOP and re-read entire file
- NEVER repeat exactly the same action that just failed

🎯 MANDATORY RESPONSE FORMAT:

RESPOND ONLY IN VALID XML - NO TEXT BEFORE OR AFTER THE XML.
⚠️ ALWAYS START WITH < AND END WITH >
USE ONLY ONE <tools> TAG FOR THE NEXT ACTION:

🚨 COMMON ERRORS FOR ACTIONS:
❌ tools name="action">  ← WRONG: missing < at start  
✅ <tools name="action"> ← CORRECT: with < at start
❌ <param name="path"="value" />  ← WRONG: incorrect syntax
✅ <param name="path" value="value" />  ← CORRECT: name then value
❌ Patch already modified file → RE-READ first with read_file_lines

<tools name="read_file_lines">
  <param name="path" value="file.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

OR

<tools name="patch_file">
  <param name="path" value="file.ext" />
  <changes>
    <change action="replace" line="15">
      <old>exact old text</old>
      <new>new text</new>
    </change>
  </changes>
</tools>

OR

<tools name="run_command">
  <param name="cwd" value="." />
  <command>ls -la</command>
</tools>

COMPLETE EXAMPLES:

1. Create empty file:
<tools name="create_file">
  <param name="path" value="server.log" />
</tools>

2. Create file with content:
<tools name="create_file">
  <param name="path" value="config.py" />
  <content># Configuration
port = 8000</content>
</tools>

3. Fix "Address already in use" error:
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

  // Extract recurring errors to avoid repeating them
  const errors = [];
  const analyzedFiles = new Set();
  const analyzedFilesWithRanges = new Map(); // Track files with their line ranges
  const failedActions = new Set();
  const indentationErrors = [];
  
  // Normalize data to handle both possible formats
  const normalizedResults = Array.isArray(executionResults) ? executionResults : [];
  
  normalizedResults.forEach(result => {
    // Format 1: result has a results property (old format)
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
    // Format 2: result is directly a completedStep (new format)
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

  // Detect repeated analyses
  const repeatedAnalyses = Array.from(analyzedFilesWithRanges.entries())
    .filter(([key, count]) => count >= 2)
    .map(([key, count]) => `${key} (${count} times)`);

  const systemPrompt = `You are an expert AI agent in development problem solving. You just executed a plan and must now accurately evaluate the situation.

🚨 LOOP DETECTION:
${repeatedAnalyses.length > 0 ? `You have analyzed these files/ranges MULTIPLE TIMES:
${repeatedAnalyses.join('\n')}

STOP! You are in a loop. FORBIDDEN to redo analyze_file on these ranges!` : ''}

IMPORTANT - ERROR LEARNING:
${errors.length > 0 ? `You made these errors recently - DO NOT REPEAT THEM:
${errors.map(e => `- ${e}`).join('\n')}

RULES TO AVOID ERRORS:
- If file doesn't exist, use "list_directory" first to see what's available
- If you're looking for a file with missing extension, add appropriate extension (.py, .js, etc.)
- NEVER try to analyze the same non-existent file multiple times
- For IndentationError Python: the line mentioned in error needs indentation (4 spaces)
- If "expected an indented block after class definition", the line AFTER ':' must be indented
- NEVER patch_file with old === new (that changes nothing!)
- If you already analyzed a file, DON'T DO IT AGAIN - take action!
` : ''}

${indentationErrors.length > 0 ? `🚨 PERSISTENT INDENTATION ERROR:
${indentationErrors[indentationErrors.length - 1]}

REQUIRED SOLUTION for IndentationError:
- If "expected an indented block after class definition on line X", then line Y that follows needs indentation
- Add 4 spaces at the beginning of the problematic line
- Example: change "def method(self):" to "    def method(self):" (4 spaces before)
- OR add indented "pass" if class is empty: "    pass"
- AFTER patch_file: run_command with "python file.py" to VERIFY error is fixed
- NEVER redo analyze_file after patch_file unless error changes
` : ''}

AVAILABLE ACTIONS with required parameters:
- read_file_lines: {"path": "file.ext", "start_line": 1, "end_line": 50} - MANDATORY: minimum 10 lines (recommended 30+ for more context)
- create_file: {"path": "file.ext", "content": "complete content"}
- patch_file: {"path": "file.ext", "changes": [{"action": "replace", "line": 15, "old": "old text", "new": "new text"}]}
- run_command: {"command": "shell command", "cwd": ".", "timeout": 5000} - optional timeout in ms for servers
- create_directory: {"path": "folder/path"}
- list_directory: {"path": "directory/path"}

🕐 TIMEOUT USAGE for run_command:
- ADD "timeout": 5000 (5 seconds) to test servers/applications that don't stop
- Examples: python3 server.py, node app.js, npm start, uvicorn main:app
- Process will be automatically killed after timeout
- You'll receive stdout/stderr to evaluate if server started properly
- DON'T add timeout for normal commands (ls, cat, grep, etc.)

IMPORTANT FOR patch_file:
- You MUST specify exact changes with "old" and "new"
- If you don't know exact line content, use "read_file_lines" first with minimum 50 lines
- DON'T generate patch_file without precise changes

RESPOND ONLY IN VALID XML - NO MARKDOWN, NO BACKTICKS, NO TEXT BEFORE/AFTER.`;

  const userPrompt = `🎯 TÂCHE ORIGINALE: "${task}"

💬 CONVERSATION COMPLETE (RAW - WITHOUT INTERPRETATION):
${normalizedResults.map((result, index) => {
  const stepNum = index + 1;
  const action = result.action || result.description || 'Action inconnue';
  const status = result.status === 'completed' ? '✅' : '❌';
  
  let conversation = `\n${stepNum}. ${status} ${action}`;
  
  // Show raw/raw output of command or action
  if (result.result && typeof result.result === 'string') {
    const rawResult = result.result.trim();
    if (rawResult) {
      conversation += `\n   RAW OUTPUT:\n   ${rawResult.split('\n').map(line => `   ${line}`).join('\n')}`;
    }
  }
  
  // Show errors also in raw conversation
  if (result.error && typeof result.error === 'string') {
    const rawError = result.error.trim();
    if (rawError) {
      conversation += `\n   RAW ERROR:\n   ${rawError.split('\n').map(line => `   ${line}`).join('\n')}`;
    }
  }
  
  return conversation;
}).join('\n')}

🔍 ACTIONS ALREADY EXECUTED AND THEIR RESULTS:
${normalizedResults.map((r, index) => {
  // Handle both formats
  let actionName, status, resultText = '';
  
  if (r.results && Array.isArray(r.results)) {
    // Old format: result contains results
    actionName = `Plan ${index + 1} (${r.results.length} actions)`;
    status = r.results.every(ar => ar.success) ? '✅' : '❌';
    
    // Show individual action results
    const actionDetails = r.results.map(ar => {
      const arStatus = ar.success ? '✅' : '❌';
      const arName = ar.action?.action || ar.description || 'action';
      return `${arStatus} ${arName}`;
    }).join(', ');
    resultText = `\n   Actions: ${actionDetails}`;
  } else {
    // New format: result is directly a completed action
    actionName = r.action || r.description || 'Action inconnue';
    status = r.status === 'completed' ? '✅' : '❌';
    
    // Include detailed results for each action
    if (r.result && typeof r.result === 'string' && r.result.trim()) {
      // Limit long result display
      const lines = r.result.trim().split('\n');
      if (lines.length > 3) {
        resultText = `\n   Result: ${lines.slice(0, 3).join(', ')} ... (${lines.length} lines total)`;
      } else {
        resultText = `\n   Result: ${r.result.trim()}`;
      }
    }
  }
  
  return `${index + 1}. ${status} ${actionName}${resultText}`;
}).join('\n')}

Files already analyzed: ${Array.from(analyzedFiles).join(', ') || 'None'}
Actions that failed: ${Array.from(failedActions).join(', ') || 'None'}

${repeatedAnalyses.length > 0 ? `\n🔄 LOOP WARNING: You have analyzed ${repeatedAnalyses.length} file(s) MULTIPLE TIMES !
${repeatedAnalyses.join('\n')}

If the error persists after multiple analyses, it's because:
1. The previous patch_file didn't work (check exact text)
2. The error is elsewhere in the file
3. A different approach is needed

FORBIDDEN to redo analyze_file on the same ranges !` : ''}

${errors.length > 0 ? `\n⚠️ ATTENTION: You have already made ${errors.length} error(s). Learn from your mistakes !` : ''}

🎯 STRICT EVALUATION OF THE ORIGINAL TASK:

TASK REQUIRED: "${task}"

ANALYSIS OF RESULTS OBTAINED:
${executionResults.map((r, index) => {
  const status = r.status === 'completed' ? '✅' : '❌';
  const actionName = r.description || r.action || 'Action inconnue';
  
  // Analyze results to extract useful information
  let insights = '';
  if (r.result && typeof r.result === 'string') {
    const result = r.result.toLowerCase();
    
    // Detect found files
    if (result.includes('./test.js') || result.includes('test.js')) {
      insights += ' → test.js found';
    }
    
    // Detect content read
    if (result.includes('function ') && result.includes('console.log')) {
      insights += ' → content read, functions detected';
    }
    
    // Detect modifications
    if (result.includes('modified') || result.includes('added')) {
      insights += ' → file modified';
    }
  }
  
  return `${status} ${actionName}${insights}`;
}).join('\n')}

🤔 REQUIRED ANALYSIS - DO NOT REPEAT ALREADY DONE ACTIONS:

1. FILES ALREADY FOUND: 
   ${executionResults.some(r => r.result && r.result.includes('./test.js')) ? '✅ test.js is already found/localized' : '❌ test.js not yet found'}

2. CONTENT ALREADY READ:
   ${executionResults.some(r => r.result && r.result.includes('function ') && r.result.includes('add')) ? '✅ test.js already read, content known' : '❌ test.js not yet read'}

3. MODIFICATIONS ALREADY MADE:
   ${executionResults.some(r => r.result && (r.result.includes('divide') || r.result.includes('modified'))) ? '✅ divide function already added' : '❌ divide function not yet added'}

🧠 ANALYSIS OF RAW CONVERSATION ABOVE:

Look at the raw output of executed commands and determine what was ACTUALLY done.

⚠️ CRITICAL RULES FOR READING RESULTS:

📁 FOUND FILES:
- IF you see "./test.js" in a find output → test.js IS FOUND
- IF you see a list of directories → the directory A IS LISTED

📖 READ FILES:
- IF you see "📄 Content (X lines):" followed by code → the file A IS READ
- IF you see line numbers with code → the content IS KNOWN

🔧 SUCCESSFUL MODIFICATIONS:
- IF you see "✅ File modified successfully" → the modification IS COMPLETED
- IF you see "📊 X/X changes applied" → the patch A WORKED
- IF you see "💾 Save created" → the file A IS MODIFIED

❌ FAILED MODIFICATIONS:
- IF you see "❌ No changes applied" → the patch A FAILED
- IF you see "text not found" → you need to re-read the file first

🎯 DETERMINE NEXT LOGICAL STEP:

Looking at the raw conversation above, answer these questions:

1. Is there a "✅ File modified successfully" for test.js ?
   ${normalizedResults.some(r => r.result && r.result.includes('✅ File modified successfully') && r.result.includes('test.js')) ? '→ YES, test.js A IS MODIFIED' : '→ NO, not yet modified'}

2. Are there "📊 X/X changes applied" with success ?
   ${normalizedResults.some(r => r.result && r.result.includes('changes(s) applied') && !r.result.includes('❌')) ? '→ YES, changes APPLIED' : '→ NO, no changes applied'}

3. Is the task "${task}" completed ?
   ${normalizedResults.some(r => r.result && r.result.includes('✅ File modified successfully') && r.result.includes('test.js')) ? '→ ✅ YES, TASK COMPLETED' : '→ ❌ NO, continue'}

FINAL DECISION: ${normalizedResults.some(r => r.result && r.result.includes('✅ File modified successfully') && r.result.includes('test.js')) ? 'status: "complete"' : 'status: "continue"'}

CONCRETE EXAMPLES:
- If the task is "add the divide function and its test in test.js":
  * ❌ "continue" if you only found test.js (you still need to add the function AND the test)
  * ✅ "complete" only if the divide function AND its test have been added to test.js
  
- If the task is "create a Button component":
  * ❌ "continue" if you only created the directory (you still need to create the file)
  * ✅ "complete" only if the Button component is fully created

DECISION:
- "continue" : There are still concrete elements missing from the original task
- "complete" : ALL required elements have been fully completed

ABSOLUTELY avoid repeating the same actions. Propose a NEW approach if necessary.

RESPOND ONLY IN VALID XML - NO MARKDOWN, NO BACKTICKS:

If the task is COMPLETE:
<status>complete</status>

If the task should CONTINUE with actions:
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
      max_tokens: 2000
    });

    // Display token information for evaluateAndContinue
    if (response.usage) {
      console.log(chalk.gray(`🔄 EVALUATION - Tokens: Envoyés ${response.usage.prompt_tokens} | Reçus ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Process thinking tags
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
    try {
      // Extract status
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
      
      // Extract actions
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
 * Generates a new plan with specific user instructions
 */
export async function generateCorrectedPlan(task, userInstructions, previousContext = {}) {

  const systemPrompt = `You are an autonomous expert AI development agent. The user has given you specific instructions to correct or improve your strategy.

MISSION: Generate a new plan based on user instructions.

USER INSTRUCTIONS: "${userInstructions}"

YOU MUST:
- Take into account the specific user instructions
- Adapt your strategy accordingly  
- Generate concrete and correct actions
- Explain how you take the instructions into account

${generateXMLInstructions()}

CRITICAL RULES FOR patch_file:
- You MUST read the file first to know the exact content
- For specific line N error: read_file_lines with minimum 50 lines around the error!
- You MUST specify the exact text in "old" that really exists in the file
- NO patch_file without knowing the exact line content
- EXAMPLE: error line 15 → read_file_lines with start_line=1, end_line=50 (minimum 50 lines)`;

  const userPrompt = `ORIGINAL TASK: "${task}"

USER SPECIFIC INSTRUCTIONS: "${userInstructions}"

PREVIOUS CONTEXT:
${JSON.stringify(previousContext, null, 2)}

Working directory: ${process.cwd()}

Now generate a new plan that takes the user instructions into account.

RESPOND ONLY IN VALID XML - NO MARKDOWN:

If the task is COMPLETE:
<status>complete</status>

If the task should CONTINUE with actions:
<status>continue</status>

<tools name="read_file_lines">
  <param name="path" value="file.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

<tools name="patch_file">
  <param name="path" value="file.ext" />
  <changes>
    <change action="replace" line="15">
      <old>old text</old>
      <new>new text</new>
    </change>
  </changes>
</tools>

MANDATORY STATUSES:
- "continue": You have work to do with this new approach
- "complete": The task is finished according to user instructions

CRITICAL RULE: ALWAYS include ALL required parameters in the XML
IMPORTANT RULE: Clearly explain how you take user instructions into account`;

  try {
    const response = await makeAPICall([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], {
      temperature: 0.1,
      max_tokens: 2000
    });

    // Display token information for evaluateAndContinue
    if (response.usage) {
      console.log(chalk.gray(`🔄 EVALUATION - Tokens: Sent ${response.usage.prompt_tokens} | Received ${response.usage.completion_tokens} | Total ${response.usage.total_tokens}`));
    }

    const rawContent = response.choices[0].message.content.trim();
    
    // Process thinking tags
    const content = processThinkingResponse(rawContent, { showThinking: true });
    
    try {
      // Extract status
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
      
      // Extract actions
      const plan = parseXMLPlan(content);
      return { 
        plan: { 
          status: "continue",
          actions: plan.actions
        }
      };
    } catch (parseError) {
      throw new Error(`XML plan parsing error: ${parseError.message}`);
    }

  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Invalid API key. Check your configuration with "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Insufficient quota. Check your account');
    } else if (error.message.includes('not configured')) {
      throw new Error('API key not configured. Use "tera config" to configure it');
    } else if (error.status === 401) {
      throw new Error('Invalid or expired API key. Check your configuration with "tera config"');
    } else if (error.status === 429) {
      throw new Error('Request limit reached. Wait a moment before retrying');
    } else if (error.status === 404 && error.message.includes('model')) {
      const activeConfig = getActiveConfig();
      throw new Error(`Model "${activeConfig.model}" not found. Check your configuration with "tera config"`);
    } else {
      throw new Error(`AI Error: ${error.message}`);
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
  
  // For other providers, use existing logic
  throw new Error(`fetchAvailableModelsWithKey not implemented for provider: ${provider}`);
} 

