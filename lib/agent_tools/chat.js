import chalk from 'chalk';

/**
 * Permet à l'IA d'avoir une conversation naturelle avec l'utilisateur
 * @param {Object} params - Paramètres
 * @param {string} params.response - Réponse conversationnelle de l'IA (requis)
 * @param {string} [params.tone='friendly'] - Ton de la conversation (friendly, professional, casual, helpful, encouraging)
 * @param {boolean} [params.ask_follow_up=false] - Si l'IA veut poser une question de suivi
 * @param {string} [params.follow_up_question] - Question de suivi optionnelle
 * @returns {string} Confirmation que la réponse a été affichée
 */
export async function chat(params) {
  // Validation des paramètres requis
  if (!params.response) {
    throw new Error('Paramètre manquant: response requis');
  }
  
  const { response, tone = 'friendly', ask_follow_up = false, follow_up_question } = params;
  
  // Configuration des icônes selon le ton
  const toneConfig = {
    friendly: { icon: '😊', color: chalk.green },
    professional: { icon: '🤖', color: chalk.blue },
    casual: { icon: '💬', color: chalk.cyan },
    helpful: { icon: '🤝', color: chalk.yellow },
    encouraging: { icon: '💪', color: chalk.magenta },
    thoughtful: { icon: '🤔', color: chalk.gray }
  };
  
  const config = toneConfig[tone] || toneConfig.friendly;
  
  console.log(''); // Ligne vide pour l'espacement
  
  // Afficher la réponse conversationnelle
  console.log(config.color(`${config.icon} ${response}`));
  
  // Afficher la question de suivi si fournie
  if (ask_follow_up && follow_up_question) {
    console.log('');
    console.log(chalk.cyan(`❓ ${follow_up_question}`));
  }
  
  console.log(''); // Ligne vide de fin
  
  // Retourner une confirmation pour l'IA
  return `Réponse conversationnelle affichée (ton: ${tone})${ask_follow_up ? ', avec question de suivi' : ''}`;
}

/**
 * Raccourci pour saluer l'utilisateur
 * @param {Object} params - Paramètres
 * @param {string} [params.greeting] - Salutation personnalisée
 * @param {string} [params.context] - Contexte de la salutation
 * @returns {string} Confirmation
 */
export async function greet(params = {}) {
  const greeting = params.greeting || 'Salut ! 👋';
  const context = params.context ? ` ${params.context}` : ' Comment puis-je t\'aider aujourd\'hui ?';
  
  return await chat({
    response: greeting + context,
    tone: 'friendly',
    ask_follow_up: false
  });
}

/**
 * Raccourci pour s'excuser ou clarifier un malentendu
 * @param {Object} params - Paramètres
 * @param {string} [params.apology] - Message d'excuse personnalisé
 * @param {string} [params.clarification] - Clarification à apporter
 * @returns {string} Confirmation
 */
export async function apologize(params = {}) {
  const apology = params.apology || 'Désolé pour la confusion !';
  const clarification = params.clarification ? ` ${params.clarification}` : '';
  
  return await chat({
    response: apology + clarification,
    tone: 'helpful',
    ask_follow_up: false
  });
}

/**
 * Raccourci pour demander des clarifications à l'utilisateur
 * @param {Object} params - Paramètres
 * @param {string} params.question - Question à poser (requis)
 * @param {string} [params.context] - Contexte de la question
 * @returns {string} Confirmation
 */
export async function askQuestion(params) {
  if (!params.question) {
    throw new Error('Paramètre manquant: question requis');
  }
  
  const context = params.context ? `${params.context} ` : '';
  
  return await chat({
    response: context,
    tone: 'thoughtful',
    ask_follow_up: true,
    follow_up_question: params.question
  });
}

/**
 * Raccourci pour encourager l'utilisateur
 * @param {Object} params - Paramètres
 * @param {string} [params.message] - Message d'encouragement personnalisé
 * @param {string} [params.achievement] - Accomplissement à célébrer
 * @returns {string} Confirmation
 */
export async function encourage(params = {}) {
  let message = params.message;
  
  if (!message) {
    if (params.achievement) {
      message = `Excellent travail ! ${params.achievement} 🎉`;
    } else {
      message = 'Continue comme ça, tu fais du super boulot ! 💪';
    }
  }
  
  return await chat({
    response: message,
    tone: 'encouraging',
    ask_follow_up: false
  });
} 