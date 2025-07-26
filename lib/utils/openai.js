import OpenAI from 'openai';
import chalk from 'chalk';
import { getOpenAIKey } from './config.js';

let openaiClient = null;

/**
 * Initialise le client OpenAI
 */
function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = getOpenAIKey();
    if (!apiKey) {
      throw new Error('Clé API OpenAI non configurée');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
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
 * Génère un message de commit en utilisant l'IA
 */
export async function generateCommitMessage(diff, files) {
  try {
    const client = getOpenAIClient();
    
    const userPrompt = `Fichiers modifiés: ${files.join(', ')}

Changements:
\`\`\`diff
${diff}
\`\`\``;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: COMMIT_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    const message = response.choices[0]?.message?.content?.trim();
    if (!message) {
      throw new Error('Aucun message généré');
    }

    return message;
  } catch (error) {
    if (error.code === 'invalid_api_key') {
      throw new Error('Clé API OpenAI invalide. Vérifiez votre configuration avec "tera config"');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('Quota OpenAI insuffisant. Vérifiez votre compte OpenAI');
    } else if (error.message.includes('non configurée')) {
      throw new Error('Clé API OpenAI non configurée. Utilisez "tera config" pour la configurer');
    } else {
      throw new Error(`Erreur OpenAI: ${error.message}`);
    }
  }
} 