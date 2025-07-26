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