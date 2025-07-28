import chalk from 'chalk';
import { evaluateAndContinue } from '../utils/openai.js';
import { askConfirmation, parseAutoApprovalOptions } from '../utils/prompt.js';

/**
 * Continue d'évaluer et d'exécuter des actions jusqu'à ce que la tâche soit complète
 * @param {string} task - La tâche originale
 * @param {Array} initialCompletedSteps - Les étapes déjà complétées
 * @param {Object} options - Options d'exécution
 * @param {Object} memory - Instance du gestionnaire de mémoire
 * @param {Function} executeActionPlan - Fonction pour exécuter un plan d'actions
 * @param {Function} displayActionPlan - Fonction pour afficher un plan d'actions
 * @param {number} startTime - Timestamp de début
 * @returns {Promise<Object>} Résultat final avec toutes les étapes complétées
 */
export async function continueUntilComplete(
  task, 
  initialCompletedSteps, 
  options, 
  memory, 
  executeActionPlan,
  displayActionPlan,
  startTime
) {
  const maxIterations = Infinity;
  let allCompletedSteps = [...initialCompletedSteps];
  let iteration = 0;
  
  while (iteration < maxIterations) {
    iteration++;
    
    console.log(chalk.blue(`\n🔄 Planification de l'action suivante...`));
    
    const shouldContinue = await evaluateAndContinue(task, allCompletedSteps, {
      debug: options.debug,
      memory: memory.getContextForTask(task)
    });
    
    // Vérifier si l'IA veut continuer ET qu'il y a des actions
    const shouldActuallyContinue = shouldContinue && 
                                 shouldContinue.plan && 
                                 shouldContinue.plan.status === 'continue' &&
                                 shouldContinue.plan.actions && 
                                 shouldContinue.plan.actions.length > 0;
    
    if (shouldActuallyContinue) {
      console.log(chalk.blue('\n🔄 L\'IA suggère des actions additionnelles:'));
      if (shouldContinue.plan.analysis) {
        console.log(chalk.gray(`📝 Analyse: ${shouldContinue.plan.analysis}`));
      }
      displayActionPlan(shouldContinue.plan.actions);
      
      // Parser les options d'auto-approbation pour déterminer si on doit confirmer
      const autoApproval = parseAutoApprovalOptions(options.auto);
      const shouldAutoExecute = autoApproval.isFullAuto || autoApproval.shouldAutoApprove('continue');
      
      if (shouldAutoExecute || await askConfirmation('Exécuter les actions additionnelles ?')) {
        if (shouldAutoExecute) {
          console.log(chalk.green('✅ Actions additionnelles auto-approuvées'));
        }
        const additionalResult = await executeActionPlan(shouldContinue.plan.actions, {
          ...options,
          originalTask: `${task} (suite)`,
          startTime
        });
        
        // Ajouter les nouvelles étapes aux étapes déjà complétées
        if (additionalResult && additionalResult.completedSteps) {
          allCompletedSteps = [...allCompletedSteps, ...additionalResult.completedSteps];
        }
        
        // Pause courte avant la prochaine évaluation (sauf en mode fast)
        if (!options.fast) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else {
        console.log(chalk.yellow('\n⏹️ Arrêt demandé par l\'utilisateur'));
        break;
      }
    } else if (shouldContinue && shouldContinue.plan && shouldContinue.plan.status === 'complete') {
      console.log(chalk.green('\n✅ L\'IA considère que la tâche est terminée'));
      if (shouldContinue.plan.analysis) {
        console.log(chalk.gray(`📝 Analyse: ${shouldContinue.plan.analysis}`));
      }
      break;
    } else {
      console.log(chalk.yellow('\n⚠️ Aucune action supplémentaire suggérée'));
      break;
    }
  }
  
  if (iteration >= maxIterations) {
    console.log(chalk.yellow(`\n⚠️ Limite maximale d'itérations atteinte. Arrêt pour éviter les boucles infinies.`));
  }
  
  return {
    success: true,
    allCompletedSteps,
    totalIterations: iteration
  };
} 