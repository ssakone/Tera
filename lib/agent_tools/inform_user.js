import chalk from 'chalk';

/**
 * Permet à l'IA d'informer l'utilisateur avec des messages formatés
 * @param {Object} params - Paramètres
 * @param {string} params.message - Message principal à afficher (requis)
 * @param {string} [params.type='info'] - Type de message (info, success, warning, error, complete, tip)
 * @param {string} [params.title] - Titre optionnel pour le message
 * @param {Array<string>} [params.details] - Liste de détails optionnels
 * @param {string} [params.action_needed] - Action recommandée pour l'utilisateur
 * @returns {string} Confirmation que le message a été affiché
 */
export async function informUser(params) {
  // Validation des paramètres requis
  if (!params.message) {
    throw new Error('Paramètre manquant: message requis');
  }
  
  const { message, type = 'info', title, details, action_needed } = params;
  
  // Configuration des couleurs et icônes selon le type
  const typeConfig = {
    info: { icon: 'ℹ️', color: chalk.blue, bgColor: chalk.bgBlue },
    success: { icon: '✅', color: chalk.green, bgColor: chalk.bgGreen },
    warning: { icon: '⚠️', color: chalk.yellow, bgColor: chalk.bgYellow },
    error: { icon: '❌', color: chalk.red, bgColor: chalk.bgRed },
    complete: { icon: '🎉', color: chalk.green, bgColor: chalk.bgGreen },
    tip: { icon: '💡', color: chalk.cyan, bgColor: chalk.bgCyan },
    comment: { icon: '💬', color: chalk.gray, bgColor: chalk.bgGray },
    update: { icon: '📢', color: chalk.magenta, bgColor: chalk.bgMagenta }
  };
  
  const config = typeConfig[type] || typeConfig.info;
  
  console.log(''); // Ligne vide pour l'espacement
  
  // Afficher le titre si fourni
  if (title) {
    console.log(config.color(`${config.icon} ${title.toUpperCase()}`));
    console.log(config.color('─'.repeat(Math.min(title.length + 4, 50))));
  } else {
    console.log(config.color(`${config.icon} MESSAGE IA`));
  }
  
  // Afficher le message principal
  console.log(chalk.white(message));
  
  // Afficher les détails si fournis
  if (details && Array.isArray(details) && details.length > 0) {
    console.log('');
    console.log(chalk.gray('📋 Détails:'));
    details.forEach((detail, index) => {
      console.log(chalk.gray(`   ${index + 1}. ${detail}`));
    });
  }
  
  // Afficher l'action recommandée si fournie
  if (action_needed) {
    console.log('');
    console.log(chalk.cyan(`🎯 Action recommandée: ${action_needed}`));
  }
  
  console.log(''); // Ligne vide de fin
  
  // Retourner une confirmation pour l'IA
  const logMessage = `Message affiché à l'utilisateur (type: ${type})${title ? `, titre: "${title}"` : ''}`;
  return logMessage;
}

/**
 * Raccourci pour indiquer qu'une tâche est terminée
 * @param {Object} params - Paramètres
 * @param {string} params.task - Description de la tâche terminée (requis)
 * @param {Array<string>} [params.results] - Liste des résultats obtenus
 * @param {string} [params.next_step] - Prochaine étape suggérée
 * @returns {string} Confirmation
 */
export async function taskCompleted(params) {
  if (!params.task) {
    throw new Error('Paramètre manquant: task requis');
  }
  
  return await informUser({
    type: 'complete',
    title: 'Tâche terminée',
    message: `✨ ${params.task} est maintenant terminée avec succès !`,
    details: params.results,
    action_needed: params.next_step
  });
}

/**
 * Raccourci pour donner un conseil ou une astuce
 * @param {Object} params - Paramètres  
 * @param {string} params.tip - Le conseil à donner (requis)
 * @param {string} [params.context] - Contexte du conseil
 * @returns {string} Confirmation
 */
export async function giveTip(params) {
  if (!params.tip) {
    throw new Error('Paramètre manquant: tip requis');
  }
  
  const message = params.context 
    ? `${params.context}\n\n💡 Conseil: ${params.tip}`
    : params.tip;
  
  return await informUser({
    type: 'tip',
    title: 'Conseil',
    message: message
  });
}

/**
 * Raccourci pour donner une mise à jour sur le progrès
 * @param {Object} params - Paramètres
 * @param {string} params.status - Statut actuel (requis)
 * @param {string} [params.progress] - Information de progression (ex: "3/5 étapes")
 * @param {string} [params.next] - Prochaine action
 * @returns {string} Confirmation
 */
export async function updateStatus(params) {
  if (!params.status) {
    throw new Error('Paramètre manquant: status requis');
  }
  
  const progressInfo = params.progress ? ` (${params.progress})` : '';
  const message = `${params.status}${progressInfo}`;
  
  return await informUser({
    type: 'update',
    title: 'Mise à jour',
    message: message,
    action_needed: params.next
  });
} 