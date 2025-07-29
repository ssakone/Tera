/**
 * Parseur XML robuste pour les réponses des outils IA
 * Remplace le parsing JSON problématique
 */

/**
 * Valide les paramètres d'une action selon ses exigences
 */
function validateActionParams(action, params) {
  const validationRules = {
    'read_file_lines': {
      required: ['path', 'start_line', 'end_line'],
      validation: (p) => {
        if (!p.path) return 'Le paramètre path est obligatoire';
        if (!p.start_line) return 'Le paramètre start_line est obligatoire';
        if (!p.end_line) return 'Le paramètre end_line est obligatoire';
        if (p.start_line < 1) return 'start_line doit être >= 1';
        if (p.end_line < p.start_line) return 'end_line doit être >= start_line';
        // Règle assouplie : minimum 10 lignes au lieu de 50 pour plus de flexibilité
        if ((p.end_line - p.start_line) < 9) return 'Minimum 10 lignes requis (end_line - start_line + 1 >= 10)';
        return null;
      }
    },
    'patch_file': {
      required: ['path', 'changes'],
      validation: (p) => {
        if (!p.path) return 'Le paramètre path est obligatoire';
        if (!p.changes || !Array.isArray(p.changes) || p.changes.length === 0) {
          return 'Le paramètre changes est obligatoire et doit contenir au moins un changement';
        }
        for (let i = 0; i < p.changes.length; i++) {
          const change = p.changes[i];
          if (!change.action) return `changes[${i}]: action est obligatoire`;
          if (!change.line) return `changes[${i}]: line est obligatoire`;
          if (!change.old) return `changes[${i}]: old est obligatoire`;
          if (!change.new) return `changes[${i}]: new est obligatoire`;
        }
        return null;
      }
    },
    'create_file': {
      required: ['path'],
      validation: (p) => {
        if (!p.path) return 'Le paramètre path est obligatoire';
        return null;
      }
    },
    'run_command': {
      required: ['command'],
      validation: (p) => {
        if (!p.command) return 'Le paramètre command est obligatoire';
        return null;
      }
    }
  };

  const rules = validationRules[action];
  if (!rules) return null; // Action non validée

  return rules.validation(params);
}

/**
 * Parse une réponse XML contenant un outil et ses paramètres
 * Exemple:
 * <tools name="run_command">
 *   <param name="timeout" value="5000" />
 *   <param name="cwd" value="." />
 *   <query>ls -la</query>
 * </tools>
 */
export function parseXMLTool(xmlContent) {
  try {
    // Vérifier si le contenu est vide
    if (!xmlContent || typeof xmlContent !== 'string') {
      throw new Error('Contenu XML vide ou invalide');
    }
    
    // Nettoyer le contenu XML
    let cleanContent = xmlContent.trim();
    
    // Vérifier si le contenu nettoyé est vide
    if (!cleanContent) {
      throw new Error('Réponse vide de l\'IA - aucun contenu XML fourni');
    }
    
    // Fix commun: ajouter < manquant au début si nécessaire
    if (cleanContent.startsWith('tools name=')) {
      cleanContent = '<' + cleanContent;
    }
    
    // Fix commun: enlever les guillemets de début/fin si présents
    if (cleanContent.startsWith('"') && cleanContent.endsWith('"')) {
      cleanContent = cleanContent.slice(1, -1);
      // Re-check après avoir enlevé les guillemets
      if (cleanContent.startsWith('tools name=')) {
        cleanContent = '<' + cleanContent;
      }
    }
    
    // Vérifier si après nettoyage il reste quelque chose
    if (!cleanContent) {
      throw new Error('Contenu vide après nettoyage - probablement juste des guillemets vides');
    }
    
    // Détecter et corriger les réponses tronquées
    if (cleanContent.includes('<arg_value>')) {
      // Réponse tronquée détectée, essayer de la compléter
      // Cas spécifique: <param name="end_line"<arg_value>" (manque value=)
      cleanContent = cleanContent.replace(/(<param name="[^"]+")(<arg_value>.*)$/m, '$1 value="50" />');
      // Cas général: <param ... value="XXX<arg_value>...
      cleanContent = cleanContent.replace(/value="[^"]*<arg_value>.*$/m, 'value="50" />');
      // Nettoyer tout <arg_value> restant
      cleanContent = cleanContent.replace(/<arg_value>.*$/m, '"/>');
    }
    
    // Vérifier si la balise </tools> est présente, sinon l'ajouter
    if (!cleanContent.includes('</tools>')) {
      if (cleanContent.includes('<tools')) {
        cleanContent += '\n</tools>';
      }
    }
    
    // Extraire les balises <tools>
    const toolsMatch = cleanContent.match(/<tools\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tools>/);
    
    if (!toolsMatch) {
      throw new Error(`Aucune balise <tools> trouvée dans la réponse. Contenu reçu: "${cleanContent.substring(0, 100)}..."`);
    }
    
    const toolName = toolsMatch[1];
    const toolContent = toolsMatch[2];
    
    // Extraire les paramètres avec syntaxe tolérante
    const params = {};
    
    // Pattern normal: <param name="key" value="value" />
    const paramMatches = toolContent.matchAll(/<param\s+name="([^"]+)"\s+value="([^"]*)"[^>]*\/>/g);
    
    for (const match of paramMatches) {
      const paramName = match[1];
      const paramValue = match[2];
      
      // Convertir les types basiques
      if (paramValue === 'true') params[paramName] = true;
      else if (paramValue === 'false') params[paramName] = false;
      else if (/^\d+$/.test(paramValue)) params[paramName] = parseInt(paramValue);
      else if (/^\d*\.\d+$/.test(paramValue)) params[paramName] = parseFloat(paramValue);
      else params[paramName] = paramValue;
    }
    
    // Pattern erroné mais fréquent: <param name="key"="value" /> (fix automatique)
    const brokenParamMatches = toolContent.matchAll(/<param\s+name="([^"]+)"="([^"]*)"[^>]*\/>/g);
    
    for (const match of brokenParamMatches) {
      const paramName = match[1];
      const paramValue = match[2];
      
      // Si ce paramètre n'a pas déjà été trouvé avec la syntaxe correcte
      if (!params.hasOwnProperty(paramName)) {
        // Convertir les types basiques
        if (paramValue === 'true') params[paramName] = true;
        else if (paramValue === 'false') params[paramName] = false;
        else if (/^\d+$/.test(paramValue)) params[paramName] = parseInt(paramValue);
        else if (/^\d*\.\d+$/.test(paramValue)) params[paramName] = parseFloat(paramValue);
        else params[paramName] = paramValue;
      }
    }
    
    // Extraire le contenu de query si présent
    const queryMatch = toolContent.match(/<query>([\s\S]*?)<\/query>/);
    if (queryMatch) {
      params.query = queryMatch[1].trim();
    }
    
    // Extraire le contenu de content si présent 
    const contentMatch = toolContent.match(/<content>([\s\S]*?)<\/content>/);
    if (contentMatch) {
      params.content = contentMatch[1].trim();
    }
    
    // Extraire le contenu de command si présent
    const commandMatch = toolContent.match(/<command>([\s\S]*?)<\/command>/);
    if (commandMatch) {
      params.command = commandMatch[1].trim();
    }
    
    // Extraire le contenu de message si présent
    const messageMatch = toolContent.match(/<message>([\s\S]*?)<\/message>/);
    if (messageMatch) {
      params.message = messageMatch[1].trim();
    }
    
    // Extraire les listes (pour les changes dans patch_file par exemple)
    const changesMatch = toolContent.match(/<changes>([\s\S]*?)<\/changes>/);
    if (changesMatch) {
      const changesList = [];
      const changeMatches = changesMatch[1].matchAll(/<change\s+action="([^"]+)"\s+line="(\d+)"[^>]*>([\s\S]*?)<\/change>/g);
      
      for (const changeMatch of changeMatches) {
        const change = {
          action: changeMatch[1],
          line: parseInt(changeMatch[2])
        };
        
        const changeContent = changeMatch[3];
        const oldMatch = changeContent.match(/<old>([\s\S]*?)<\/old>/);
        const newMatch = changeContent.match(/<new>([\s\S]*?)<\/new>/);
        
        if (oldMatch) change.old = oldMatch[1];
        if (newMatch) change.new = newMatch[1];
        
        changesList.push(change);
      }
      params.changes = changesList;
    }
    
    // Valider les paramètres
    const validationError = validateActionParams(toolName, params);
    if (validationError) {
      throw new Error(`Paramètres invalides pour ${toolName}: ${validationError}`);
    }

    return {
      action: toolName,
      params: params
    };
    
  } catch (error) {
    throw new Error(`Erreur de parsing XML: ${error.message}`);
  }
}

/**
 * Parse une réponse XML contenant plusieurs outils (plan d'actions)
 */
export function parseXMLPlan(xmlContent) {
  try {
    const cleanContent = xmlContent.trim();
    
    // Extraire toutes les balises <tools>
    const toolsMatches = cleanContent.matchAll(/<tools\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tools>/g);
    
    const actions = [];
    
    for (const toolMatch of toolsMatches) {
      const fullMatch = toolMatch[0];
      const action = parseXMLTool(fullMatch);
      actions.push(action);
    }
    
    if (actions.length === 0) {
      throw new Error('Aucune action trouvée dans le plan XML');
    }
    
    return { actions };
    
  } catch (error) {
    throw new Error(`Erreur de parsing du plan XML: ${error.message}`);
  }
}

/**
 * Convertit un objet action JSON vers XML
 * Utile pour la migration progressive
 */
export function convertJSONToXML(action, params) {
  let xml = `<tools name="${action}">`;
  
  // Ajouter les paramètres simples
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (!['query', 'content', 'command', 'message', 'changes'].includes(key)) {
        xml += `\n  <param name="${key}" value="${value}" />`;
      }
    }
  }
  
  // Gérer les contenus spéciaux
  if (params.query) {
    xml += `\n  <query>${params.query}</query>`;
  }
  if (params.content) {
    xml += `\n  <content>${params.content}</content>`;
  }
  if (params.command) {
    xml += `\n  <command>${params.command}</command>`;
  }
  if (params.message) {
    xml += `\n  <message>${params.message}</message>`;
  }
  
  // Gérer les changes pour patch_file
  if (params.changes && Array.isArray(params.changes)) {
    xml += '\n  <changes>';
    for (const change of params.changes) {
      xml += `\n    <change action="${change.action}" line="${change.line}">`;
      if (change.old) xml += `\n      <old>${change.old}</old>`;
      if (change.new) xml += `\n      <new>${change.new}</new>`;
      xml += '\n    </change>';
    }
    xml += '\n  </changes>';
  }
  
  xml += '\n</tools>';
  return xml;
}

/**
 * Génère les instructions XML pour les prompts système
 */
export function generateXMLInstructions() {
  return `
🎯 MANDATORY XML RESPONSE FORMAT:

⚠️ ALWAYS START WITH < AND END WITH >

Use EXACTLY this XML format (mind the < at the beginning):

<tools name="action_name">
  <param name="param1" value="value1" />
  <param name="param2" value="value2" />
  <query>query content</query>
</tools>

🚨 COMMON ERRORS TO AVOID:

1. Missing tools tag:
❌ tools name="action">  ← WRONG: missing < at start
✅ <tools name="action"> ← CORRECT: with < at start

2. Stray quotes:
❌ "tools name="action">...  ← WRONG: starts with quote
✅ <tools name="action">...  ← CORRECT: starts with <

3. Incorrect param syntax:
❌ <param name="path"="value" />  ← WRONG: missing "value"
✅ <param name="path" value="value" />  ← CORRECT: name="key" value="value"

4. Wrong attribute order:
❌ <param value="test" name="path" />  ← WRONG: value before name
✅ <param name="path" value="test" />  ← CORRECT: name then value

🚨 CRITICAL ANTI-LOOP RULES:

⛔ NEVER REPEAT THE SAME FAILING ACTION:
- If read_file_lines fails with "File not found" → CHANGE strategy
- If patch_file fails 2 times → STOP and re-read the file
- If command fails 3 times → COMPLETELY change approach

🔍 STRATEGIES FOR NON-EXISTENT FILES:
1. File "xxx.js" not found → Try "xxx.jsx"
2. Still not found → run_command: find . -name "*xxx*" -type f
3. Still not found → list_directory of parent folder
4. Nothing found → inform_user that file doesn't exist

💡 STRATEGIES FOR PATCH FAILURES:
1. Patch fails "No match found" → read_file_lines around target line (line-10 to line+20)
2. Still doesn't match → read_file_lines with broader range (1 to 100)
3. Content completely different → File was modified, adapt to current content
4. Multiple patch failures → Stop patching, inform_user about the issue

Available actions examples:

1. Read a file (ALL PARAMETERS REQUIRED):
<tools name="read_file_lines">
  <param name="path" value="file.ext" />
  <param name="start_line" value="1" />
  <param name="end_line" value="50" />
</tools>

⚠️ REQUIRED PARAMETERS for read_file_lines:
- path: file path (REQUIRED)
- start_line: start line number (REQUIRED, minimum 1)
- end_line: end line number (REQUIRED, minimum 10 lines, recommended 50+)

2. Execute a command:
<tools name="run_command">
  <param name="timeout" value="5000" />
  <param name="cwd" value="." />
  <command>ls -la</command>
</tools>

3. Patch a file (ATTENTION TO SPACES AND INDENTATION):
<tools name="patch_file">
  <param name="path" value="file.ext" />
  <changes>
    <change action="replace" line="15">
      <old>          exact old text with indentation</old>
      <new>          new text with same indentation</new>
    </change>
  </changes>
</tools>

4. Create a file:
<tools name="create_file">
  <param name="path" value="new_file.ext" />
  <content>complete file content</content>
</tools>

5. Inform user:
<tools name="inform_user">
  <param name="type" value="info" />
  <param name="title" value="Optional title" />
  <message>Main message</message>
</tools>

🚨 CRITICAL RULES - REQUIRED PARAMETERS:

📋 FOR read_file_lines (ALL REQUIRED):
- path="file/path" (REQUIRED)
- start_line="1" (REQUIRED, number >= 1)  
- end_line="50" (REQUIRED, minimum 10 lines, recommended 50+)

🖥️ FOR run_command (REQUIRED):
- command="command to execute" in <command>tag</command>

📁 FOR create_file (REQUIRED):
- path="file/path" (REQUIRED)

🔧 FOR patch_file (ALL REQUIRED):
- path="file/path" (REQUIRED)
- <changes> with at least one <change> (REQUIRED)

🚨 CRITICAL RULES FOR PATCH_FILE:

1. **ALWAYS read file first** with read_file_lines to see EXACT content
2. **Respect exact indentation**: include all spaces/tabs from line start
3. **Match content line by line**: don't try to match multiple lines at once
4. **Use EXACT text** as it appears in the file
5. **One line at a time**: if you need to change multiple lines, make multiple <change>
6. **🚨 FILE ALREADY MODIFIED WARNING**: If patch fails, file was already changed. Re-read with read_file_lines to see CURRENT state!

⚠️ PATCH FAILURE DIAGNOSIS:
- If "No match found" → File was already modified, re-read with read_file_lines
- If old content doesn't match → File changed, use smaller range to see exact content  
- If multiple attempts fail → Stop patching, read_file_lines around the target line (±20 lines)
- If content differs from expectation → The file was modified by previous operations

🔄 SMART RECOVERY STRATEGIES:
- Patch fails? → read_file_lines with target_line-10 to target_line+10 first
- Still confused? → read_file_lines 1 to 50 to see file structure
- Need whole file? → read_file_lines 1 to 200 (or file length)

CORRECT patch_file EXAMPLES:

Bad (without indentation):
<change action="replace" line="10">
  <old>const port = 3000;</old>
  <new>const port = 8080;</new>
</change>

Good (with exact indentation):
<change action="replace" line="10">
  <old>  const port = 3000;</old>
  <new>  const port = 8080;</new>
</change>

IMPORTANT RULES:
- NEVER any text before or after XML tags
- Use <query>, <command>, <content>, <message> tags for long content
- Simple parameters go in <param> attributes
- For patch_file, use <changes> structure with <old> and <new>
- **MANDATORY**: read_file_lines BEFORE any patch_file to see exact content
`;
}

/**
 * Normalise les espaces dans une chaîne pour la comparaison
 * Aide à gérer les problèmes d'indentation
 */
export function normalizeWhitespace(text) {
  if (!text) return '';
  
  // Préserver l'indentation de début mais normaliser les autres espaces
  const lines = text.split('\n');
  return lines.map(line => {
    // Garder l'indentation de début, normaliser le reste
    const match = line.match(/^(\s*)(.*)/);
    if (match) {
      const indent = match[1];
      const content = match[2];
      // Normaliser seulement les espaces multiples dans le contenu, pas l'indentation
      return indent + content.replace(/\s+/g, ' ').trim();
    }
    return line;
  }).join('\n');
}

/**
 * Améliore le parsing XML pour mieux gérer l'indentation
 */
export function parseXMLToolImproved(xmlContent) {
  try {
    const result = parseXMLTool(xmlContent);
    
    // Si c'est un patch_file, normaliser les espaces dans old/new
    if (result.action === 'patch_file' && result.params.changes) {
      result.params.changes = result.params.changes.map(change => {
        if (change.old) {
          // Garder l'indentation exacte pour old
          change.old = change.old;
        }
        if (change.new) {
          // Garder l'indentation exacte pour new
          change.new = change.new;
        }
        return change;
      });
    }
    
    return result;
  } catch (error) {
    throw error;
  }
} 

/**
 * Suggère une action alternative quand une action échoue répétitivement
 */
export function suggestAlternativeAction(failedAction, failedParams, errorMessage) {
  // Détecter le type d'erreur et suggérer une alternative
  if (errorMessage && errorMessage.includes('Fichier non trouvé')) {
    const path = failedParams?.path;
    if (path) {
      const pathWithoutExt = path.replace(/\.[^/.]+$/, "");
      const dir = path.split('/').slice(0, -1).join('/') || '.';
      const filename = path.split('/').pop().replace(/\.[^/.]+$/, "");
      
      // Suggérer différentes extensions ou recherches
      if (path.endsWith('.js')) {
        return {
          action: 'read_file_lines',
          params: {
            path: path.replace('.js', '.jsx'),
            start_line: 1,
            end_line: 50
          },
          reason: 'Essayer .jsx au lieu de .js'
        };
      } else if (path.endsWith('.jsx')) {
        return {
          action: 'run_command',
          params: {
            command: `find . -name "*${filename}*" -type f | head -10`,
            cwd: '.'
          },
          reason: 'Rechercher le fichier avec find'
        };
      } else {
        return {
          action: 'list_directory',
          params: {
            path: dir
          },
          reason: 'Lister le contenu du répertoire parent'
        };
      }
    }
  }
  
  if (errorMessage && errorMessage.includes('changement(s) appliqué(s)') && errorMessage.includes('❌')) {
    return {
      action: 'read_file_lines', 
      params: {
        path: failedParams?.path,
        start_line: 1,
        end_line: 100
      },
      reason: 'Relire le fichier car patch a échoué (probablement déjà modifié)'
    };
  }
  
  return null;
} 