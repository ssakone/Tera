import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { execSync } from 'child_process';
import { runCommandWithOutput } from '../agent_tools/run_command.js';
import { generateActionPlan, evaluateAndContinue, generateCorrectedPlan, generateNextAction } from '../utils/openai.js';
import { askConfirmation, askRecoveryAction, askAdvancedConfirmation, askInput, parseAutoApprovalOptions } from '../utils/prompt.js';
import { isConfigured, setupConfig, getActiveConfig } from '../utils/config.js';
import { readFile, writeFile, fileExists, createDirectory } from '../utils/file.js';
import { getMemoryManager, initializeDefaultMemory } from '../utils/memory.js';
import { readFileWithLines } from '../agent_tools/read_file.js';
import { continueUntilComplete } from '../agent_tools/continue_until_complete.js';
import { patchFileWithDiagnostics } from '../agent_tools/patch_file.js';
import { createFile as createFileWithTool } from '../agent_tools/create_file.js';
import { informUser, taskCompleted, giveTip, updateStatus } from '../agent_tools/inform_user.js';
import { chat, greet, apologize, askQuestion, encourage } from '../agent_tools/chat.js';

/**
 * Exécuteur d'actions
 */
class ActionExecutor {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 0;
    this.fileMemory = {}; // Mémoire des fichiers lus
  }

  async executeAction(step) {
    // Pour les actions de découverte, ne pas afficher d'étape
    if (step.action === 'list_directory' || step.action === 'read_file_lines') {
      try {
        switch (step.action) {
          case 'list_directory':
            return await this.listDirectory(step.params);
          case 'read_file_lines':
            return await readFileWithLines(step.params);
          default:
            throw new Error(`Action de découverte non supportée: ${step.action}`);
        }
      } catch (error) {
        console.log(chalk.red(`Erreur: ${error.message}`));
        throw error;
      }
    } 
    
    // Pour les actions d'exécution
    this.currentStep++;
    
    console.log(chalk.blue(`📋 Étape ${this.currentStep}/${this.totalSteps}: ${step.description}`));
    
    const spinner = ora({
      text: step.description,
      color: 'cyan'
    }).start();

    let actionResult = undefined; // <== AJOUTÉ : stocker le résultat renvoyé par l'action
    try {
      switch (step.action) {
        case 'create_file':
          actionResult = await this.createFile(step.params);
          break;
        case 'modify_file':
          await this.modifyFile(step.params);
          actionResult = `✅ Fichier modifié: ${path.resolve(step.params.path)}`;
          break;
        case 'patch_file':
          actionResult = await this.patchFile(step.params); // retourne déjà un message détaillé
          break;
        case 'run_command':
          actionResult = await this.runCommand(step.params);
          break;
        case 'create_directory':
          await this.createDir(step.params);
          actionResult = `✅ Dossier créé: ${path.resolve(step.params.path)}`;
          break;
        case 'inform_user':
          actionResult = await informUser(step.params);
          break;
        case 'task_completed':
          actionResult = await taskCompleted(step.params);
          break;
        case 'give_tip':
          actionResult = await giveTip(step.params);
          break;
        case 'update_status':
          actionResult = await updateStatus(step.params);
          break;
        case 'chat':
          actionResult = await chat(step.params);
          break;
        case 'greet':
          actionResult = await greet(step.params);
          break;
        case 'apologize':
          actionResult = await apologize(step.params);
          break;
        case 'ask_question':
          actionResult = await askQuestion(step.params);
          break;
        case 'encourage':
          actionResult = await encourage(step.params);
          break;
        default:
          throw new Error(`Action non supportée: ${step.action}`);
      }
      
      spinner.succeed(chalk.green(`✅ ${step.description}`));
      return actionResult; // <== AJOUTÉ : retourner le résultat pour qu'il soit enregistré
    } catch (error) {
      spinner.fail(chalk.red(`❌ ${step.description}`));
      throw error;
    }
  }

  async createFile(params) {
    return await createFileWithTool(params);
  }

  async modifyFile(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    const absolutePath = path.resolve(params.path);
    if (!fileExists(absolutePath)) {
      throw new Error(`Fichier non trouvé: ${absolutePath}`);
    }
    
    console.log(chalk.gray(`   ✏️  Modification fichier: ${absolutePath}`));
    console.log(chalk.gray(`   🔄 Chemin résolu: ${params.path} → ${absolutePath}`));
    
    if (params.content) {
      writeFile(absolutePath, params.content);
    } else {
      throw new Error('Paramètre manquant: content requis pour modifier un fichier');
    }
  }

  async patchFile(params) {
    return await patchFileWithDiagnostics(params);
  }

  async listDirectory(params) {
    const dirPath = params.path || '.';
    const absolutePath = path.resolve(dirPath);
    console.log(chalk.blue(`📁 Exploration du dossier: ${absolutePath}`));
    console.log(chalk.gray(`   🔄 Chemin résolu: ${dirPath} → ${absolutePath}`));
    
    try {
      const result = execSync(`ls -la "${absolutePath}"`, { 
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      
      console.log(chalk.gray('📋 Contenu du dossier:'));
      console.log(result);
    
      return result;
    } catch (error) {
      throw new Error(`Impossible de lister le dossier: ${error.message}`);
    }
  }



  async runCommand(params) {
    return await runCommandWithOutput(params);
  }

  async createDir(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    // Utiliser le chemin absolu du dossier à créer
    const absolutePath = path.resolve(params.path);
    console.log(chalk.gray(`   📁 Création dossier: ${absolutePath}`));
    console.log(chalk.gray(`   🔄 Chemin résolu: ${params.path} → ${absolutePath}`));
    
    createDirectory(absolutePath);
  }
}

/**
 * Gestionnaire de récupération d'erreurs
 */
class ErrorRecoveryManager {
  constructor() {
    this.maxAttempts = 3;
    this.attemptCount = 0;
  }

  async handleError(error, currentPlan, completedSteps, options = {}) {
    this.attemptCount++;
    
    console.log(chalk.red(`\n❌ Erreur détectée (tentative ${this.attemptCount}/${this.maxAttempts}):`));
    console.log(chalk.red(error.message));
    
    if (this.attemptCount >= this.maxAttempts) {
      console.log(chalk.red('\n🚫 Nombre maximum de tentatives atteint'));
      throw new Error(`Échec après ${this.maxAttempts} tentatives: ${error.message}`);
    }
    
    // Analyse de l'erreur
    const errorContext = this.analyzeError(error);
    console.log(chalk.yellow(`\n🔍 Type d'erreur détecté: ${errorContext.type}`));
    
    // Demander l'action de récupération à l'utilisateur
    if (!options.auto) {
      const recoveryAction = await askRecoveryAction(error.message);
      
      if (recoveryAction === 'abort') {
        throw new Error('Arrêt demandé par l\'utilisateur');
      } else if (recoveryAction === 'skip') {
        console.log(chalk.yellow('⏭️  Étape ignorée, continuation...'));
        return { action: 'skip' };
      }
      // Si 'retry', on continue avec la génération d'un plan corrigé
    }
    
    // Générer un plan corrigé avec l'IA
    console.log(chalk.blue('\n🔄 Génération d\'un plan corrigé avec l\'IA...'));
    
    try {
      const correctedPlan = await generateCorrectedPlan(
        currentPlan,
        completedSteps,
        error.message,
        errorContext
      );
      
      return {
        action: 'retry',
        correctedPlan: correctedPlan
      };
    } catch (recoveryError) {
      console.log(chalk.red(`Erreur lors de la récupération: ${recoveryError.message}`));
      throw new Error(`Impossible de récupérer: ${recoveryError.message}`);
    }
  }
  
  analyzeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('command not found') || message.includes('commande introuvable')) {
      return { type: 'commande_manquante', severity: 'high' };
    }
    
    if (message.includes('permission denied') || message.includes('access denied')) {
      return { type: 'permission', severity: 'medium' };
    }
    
    if (message.includes('no such file') || message.includes('fichier non trouvé')) {
      return { type: 'fichier_manquant', severity: 'medium' };
    }
    
    if (message.includes('syntax error') || message.includes('syntaxe')) {
      return { type: 'syntaxe', severity: 'high' };
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return { type: 'reseau', severity: 'low' };
    }
    
    return { type: 'inconnu', severity: 'medium' };
  }
  
  reset() {
    this.attemptCount = 0;
  }
}

/**
 * Affichage des actions avant exécution
 */
function displayActionPlan(actions) {
  console.log(chalk.blue('\n📋 Plan d\'actions généré:\n'));
  
  actions.forEach((step, index) => {
    let actionIcon = '⚙️';
    
    switch (step.action) {
      case 'create_file': actionIcon = '📝'; break;
        case 'modify_file': actionIcon = '✏️'; break;
        case 'patch_file': actionIcon = '🔧'; break;
      case 'run_command': actionIcon = '🖥️'; break;
        case 'create_directory': actionIcon = '📁'; break;
      case 'list_directory': actionIcon = '📂'; break;
      case 'read_file_lines': actionIcon = '📖'; break;
      }
      
    console.log(chalk.white(`${actionIcon} ${index + 1}. ${step.description}`));
      
    // Afficher les paramètres importants
    switch (step.action) {
          case 'create_file':
          case 'modify_file':
      case 'read_file_lines':
        if (step.params.path) {
          console.log(chalk.gray(`   📁 Fichier: ${step.params.path}`));
            }
            break;
          case 'run_command':
        if (step.params.command) {
          console.log(chalk.gray(`   💻 Commande: ${step.params.command}`));
            }
            break;
          case 'create_directory':
        if (step.params.path) {
          console.log(chalk.gray(`   📁 Dossier: ${step.params.path}`));
            }
            break;
    }
  });
  
  console.log('');
}

/**
 * Gestion des prompts de confirmation avancés
 */
async function handleAdvancedConfirmation(actions, options) {
  const autoApproval = parseAutoApprovalOptions(options.auto);
  
  if (autoApproval.isFullAuto) {
    console.log(chalk.green('🚀 Mode automatique complet activé, exécution directe...'));
    return 'execute';
  }
  
  // Vérifier si toutes les actions du plan sont auto-approuvées
  if (options.auto && typeof options.auto === 'string') {
    const allActionsApproved = actions.every(action => autoApproval.shouldAutoApprove(action.action));
    if (allActionsApproved) {
      console.log(chalk.green('🚀 Toutes les actions du plan sont auto-approuvées, exécution directe...'));
      return 'execute';
    } else {
      console.log(chalk.yellow('⚠️ Certaines actions du plan ne sont pas auto-approuvées, confirmation requise'));
    }
  }
  
  const response = await askAdvancedConfirmation(`Voulez-vous exécuter ce plan de ${actions.length} action(s) ?`);
  
  // askAdvancedConfirmation retourne soit true, soit un objet avec {confirmed: false, recovery}
  if (response === true || (response && response.confirmed === true)) {
    return 'execute';
  } else {
    return 'abort';
  }
}

/**
 * Fonction principale d'exécution des actions
 */
async function executeActionPlan(actions, options = {}) {
    const executor = new ActionExecutor();
  const errorManager = new ErrorRecoveryManager();
  const memory = getMemoryManager();
  
  // Calculer le nombre d'étapes d'exécution (exclure les découvertes)
  const executionSteps = actions.filter(step => 
    step.action !== 'list_directory' && step.action !== 'read_file_lines'
  );
  executor.totalSteps = executionSteps.length;
  
  let completedSteps = [];
  let currentPlan = [...actions];
  
  console.log(chalk.blue(`\n🎯 Début de l'exécution (${executor.totalSteps} étapes)`));
  
  for (let i = 0; i < currentPlan.length; i++) {
    const step = currentPlan[i];
    
    try {
      const result = await executor.executeAction(step);
      
      completedSteps.push({
        ...step,
        status: 'completed',
        result: result
      });
      
      // Pause entre les actions si pas en mode fast
      if (!options.fast && !options.auto) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
    } catch (error) {
      // Gestion de récupération d'erreur
      try {
        const recovery = await errorManager.handleError(
          error, 
          currentPlan, 
          completedSteps, 
          options
        );
        
        if (recovery.action === 'skip') {
          completedSteps.push({
            ...step,
            status: 'skipped',
            error: error.message
          });
          continue;
        } else if (recovery.action === 'retry' && recovery.correctedPlan) {
          console.log(chalk.blue('\n🔄 Application du plan corrigé...'));
          
          // Remplacer le plan actuel par le plan corrigé
          currentPlan = recovery.correctedPlan;
          
          // Réinitialiser l'index pour redémarrer depuis le début du nouveau plan
          i = -1; // Sera incrémenté à 0 au prochain tour de boucle
          
          // Recalculer le nombre d'étapes
          const newExecutionSteps = currentPlan.filter(step => 
            step.action !== 'list_directory' && step.action !== 'read_file_lines'
          );
          executor.totalSteps = newExecutionSteps.length;
          executor.currentStep = 0;
          
          // Réinitialiser le compteur d'erreurs
          errorManager.reset();
          
          continue;
        }
      } catch (recoveryError) {
        // Si la récupération échoue, arrêter complètement
        console.log(chalk.red(`\n💥 Échec de la récupération: ${recoveryError.message}`));
        
        // Sauvegarder l'état d'échec en mémoire
        memory.addEpisode('agent_failure', {
          task: options.originalTask || 'Tâche inconnue',
          error: recoveryError.message,
          completedSteps: completedSteps.length,
          totalSteps: currentPlan.length
        });
        
        throw recoveryError;
      }
    }
  }
  
  // Sauvegarder le succès en mémoire
  memory.addEpisode('agent_success', {
    task: options.originalTask || 'Tâche inconnue',
    completedSteps: completedSteps.length,
    totalSteps: currentPlan.length,
    executionTime: Date.now() - (options.startTime || Date.now())
  });
  
  console.log(chalk.green(`\n✅ Toutes les actions ont été exécutées avec succès !`));
  console.log(chalk.gray(`📊 ${completedSteps.length} étape(s) terminée(s)`));
  
  return {
    success: true,
    completedSteps,
    totalSteps: currentPlan.length
  };
}



/**
 * Commande agent avec plan complet (ancienne approche)
 */
export async function agentCommandWithPlan(task, options = {}) {
  const startTime = Date.now();
  
  try {
    // Vérifier la configuration
    if (!isConfigured()) {
      console.log(chalk.yellow('⚙️  Configuration requise...'));
      await setupConfig();
    }
    
    // Initialiser la mémoire par défaut si nécessaire
    await initializeDefaultMemory();
    
    const memory = getMemoryManager();
    const config = getActiveConfig();
    
    console.log(chalk.blue('🤖 Tera Agent - Assistant IA pour l\'automatisation\n'));
    console.log(chalk.white('📋 Tâche demandée:'), chalk.cyan(task));
    console.log(chalk.gray(`🔗 Provider: ${config.provider} | Modèle: ${config.model}\n`));
    
            if (options.debug) {
      console.log(chalk.magenta('🐛 Mode debug activé\n'));
    }
    
    // Générer le plan d'actions avec l'IA
    console.log(chalk.blue('🤖 Génération du plan d\'actions avec l\'IA...'));
    
    const planResult = await generateActionPlan(task, {
      debug: options.debug,
      memory: memory.getContextForTask(task)
    });
    
    const actions = planResult.plan ? planResult.plan.actions : planResult.actions;
    
    if (!actions || !Array.isArray(actions) || actions.length === 0) {
      console.log(chalk.red('❌ Aucune action générée par l\'IA'));
      return;
    }
    
    // Afficher le plan généré
    displayActionPlan(actions);
    
    // Demander confirmation avec options avancées
    const confirmationResult = await handleAdvancedConfirmation(actions, options);
    
    if (confirmationResult === 'abort') {
      console.log(chalk.yellow('🚫 Exécution annulée par l\'utilisateur'));
                return;
    }
    
    // Exécuter le plan d'actions
    const executionResult = await executeActionPlan(actions, {
      ...options,
      originalTask: task,
      startTime
    });
    
    // Évaluation et continuation récursive (toujours, même en mode fast)
    await continueUntilComplete(
          task, 
      executionResult.completedSteps, 
      options, 
      memory, 
      executeActionPlan,
      displayActionPlan,
      startTime
    );
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.green(`\n🎉 Tâche terminée avec succès en ${duration}s !`));
        
      } catch (error) {
    console.log(chalk.red(`\n💥 Erreur: ${error.message}`));
    
    if (options.debug) {
      console.error(error);
    }
    
    process.exit(1);
  }
}

/**
 * Commande agent principale (approche itérative - une action à la fois)
 */
export async function agentCommand(task, options = {}) {
  const startTime = Date.now();
  
  try {
    // Vérifier la configuration
    if (!isConfigured()) {
      console.log(chalk.yellow('⚙️  Configuration requise...'));
      await setupConfig();
    }
    
    // Initialiser la mémoire par défaut si nécessaire
    await initializeDefaultMemory();
    
    const memory = getMemoryManager();
    const config = getActiveConfig();
    
    console.log(chalk.blue('🤖 Tera Agent - Assistant IA pour l\'automatisation\n'));
    
    // Si aucune tâche n'est fournie, demander à l'utilisateur
    if (!task || task.trim() === '') {
      console.log(chalk.blue('💬 Quelle tâche souhaitez-vous que je réalise ?'));
      task = await askInput(chalk.cyan('Tâche à accomplir:'));
      
      if (!task || task.trim() === '') {
        console.log(chalk.yellow('❌ Aucune tâche fournie. Au revoir !'));
        return;
      }
    }
    
    console.log(chalk.white('📋 Tâche demandée:'), chalk.cyan(task));
    console.log(chalk.gray(`🔗 Provider: ${config.provider} | Modèle: ${config.model}\n`));
    
    if (options.debug) {
      console.log(chalk.magenta('🐛 Mode debug activé\n'));
    }

    const executor = new ActionExecutor();
    const errorManager = new ErrorRecoveryManager();
    let completedActions = [];
    let stepNumber = 0;
    const maxSteps = Infinity; // Pas de limite

    console.log(chalk.blue('🎯 Exécution itérative - génération d\'actions une par une\n'));

    // Parser les options d'auto-approbation
    const autoApproval = parseAutoApprovalOptions(options.auto);

    while (stepNumber < maxSteps) {
      stepNumber++;
      
      // Générer la prochaine action
      console.log(chalk.blue(`🔄 Planification de l'action suivante...`));
      
      let actionResult;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          actionResult = await generateNextAction(task, completedActions, {
            debug: options.debug,
            memory: memory.getContextForTask(task)
          });
          break; // Succès, sortir de la boucle de retry
        } catch (error) {
          retryCount++;
          if (error.message.includes('Erreur de parsing JSON')) {
            console.log(chalk.yellow(`⚠️ Erreur de parsing JSON (tentative ${retryCount}/${maxRetries}), nouvelle tentative...`));
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Pause de 1s
              continue;
            }
          }
          // Si ce n'est pas une erreur de parsing JSON ou si on a atteint le max de retries, relancer l'erreur
          throw error;
        }
      }

      if (actionResult.status === 'completed') {
        console.log(chalk.green('\n🎉 Tâche terminée avec succès !'));
        
        // Afficher un résumé des actions accomplies
        const completedCount = completedActions.filter(a => a.status === 'completed').length;
        const failedCount = completedActions.filter(a => a.status === 'failed').length;
        
        console.log(chalk.blue('\n📊 Résumé de l\'exécution:'));
        console.log(chalk.green(`   ✅ ${completedCount} actions réussies`));
        if (failedCount > 0) {
          console.log(chalk.red(`   ❌ ${failedCount} actions corrigées`));
        }
        console.log(chalk.gray(`   🔄 Total: ${stepNumber} étapes`));
        
        // Demander une nouvelle tâche à l'utilisateur
        console.log(chalk.blue('\n💬 Que souhaitez-vous faire maintenant ?'));
        const newTask = await askInput(chalk.cyan('Nouvelle tâche (ou tapez "quit" pour quitter):'));
        
        if (newTask.toLowerCase() === 'quit' || newTask.toLowerCase() === 'exit' || newTask.trim() === '') {
          console.log(chalk.yellow('👋 Au revoir !'));
          break;
        }
        
        // Redémarrer avec la nouvelle tâche
        task = newTask;
        console.log(chalk.blue(`\n🎯 Nouvelle tâche: ${chalk.cyan(task)}`));
        console.log(chalk.blue('🎯 Reprise de l\'exécution itérative...\n'));
        
        // Réinitialiser partiellement mais garder l'historique pour le contexte
        stepNumber = 0; // Redémarrer le compteur d'étapes
        // Note: on garde completedActions pour que l'IA ait le contexte des actions précédentes
        
        continue;
      }

      const action = actionResult.next_action;
      if (!action) {
        console.log(chalk.red('❌ Aucune action générée'));
        break;
      }

      // Afficher l'action
      let actionIcon = '⚙️';
      switch (action.action) {
        case 'create_file': actionIcon = '📝'; break;
        case 'modify_file': actionIcon = '✏️'; break;
        case 'patch_file': actionIcon = '🔧'; break;
        case 'run_command': actionIcon = '🖥️'; break;
        case 'create_directory': actionIcon = '📁'; break;
        case 'list_directory': actionIcon = '📂'; break;
        case 'read_file_lines': actionIcon = '📖'; break;
      }

      console.log(chalk.white(`\n${actionIcon} Prochaine action: ${action.description}`));
      
      // Afficher les paramètres importants
      switch (action.action) {
        case 'create_file':
        case 'modify_file':
        case 'read_file_lines':
        case 'patch_file':
          if (action.params.path) {
            console.log(chalk.gray(`   📁 Fichier: ${action.params.path}`));
          }
          break;
        case 'run_command':
          if (action.params.command) {
            console.log(chalk.gray(`   💻 Commande: ${action.params.command}`));
          }
          break;
        case 'create_directory':
          if (action.params.path) {
            console.log(chalk.gray(`   📁 Dossier: ${action.params.path}`));
          }
          break;
      }

      // Demander confirmation selon les options d'auto-approbation
      const shouldSkipConfirmation = autoApproval.isFullAuto || 
                                   autoApproval.shouldAutoApprove(action.action) || 
                                   options.fast;
      
      if (!shouldSkipConfirmation) {
        const proceed = await askConfirmation('\nExécuter cette action ?');
        if (!proceed) {
          console.log(chalk.yellow('🚫 Exécution annulée par l\'utilisateur'));
          return;
        }
      } else if (autoApproval.shouldAutoApprove(action.action) && !autoApproval.isFullAuto) {
        console.log(chalk.green(`✅ Action ${action.action} auto-approuvée`));
      }

      try {
        // Exécuter l'action
        const result = await executor.executeAction(action);
        
        completedActions.push({
          ...action,
          status: 'completed',
          result: result
        });

        // Pause entre les actions si pas en mode fast
        if (!options.fast && !options.auto) {
          await new Promise(resolve => setTimeout(resolve, 800));
        }

      } catch (error) {
        // Dans l'approche itérative, transmettre l'erreur à l'IA pour qu'elle décide de la prochaine action
        console.log(chalk.red(`❌ Erreur détectée: ${error.message}`));
        console.log(chalk.blue('🤖 Transmission de l\'erreur à l\'IA pour correction automatique...'));
        
        // Enregistrer l'erreur dans les actions complétées pour que l'IA la voie
        completedActions.push({
          ...action,
          status: 'failed',
          error: error.message,
          result: `❌ ERREUR: ${error.message}`
        });

        // Continuer à la prochaine itération - l'IA verra l'erreur et générera une action de correction
        // Pause courte pour la lisibilité
        if (!options.fast) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    if (stepNumber >= maxSteps) {
      console.log(chalk.yellow(`\n⚠️  Limite maximale d'actions atteinte`));
    }
    
    // Sauvegarder le succès en mémoire
    memory.addEpisode('agent_success', {
      task,
      actions: completedActions,
      duration: Date.now() - startTime
    });
    
  } catch (error) {
    console.log(chalk.red(`\n💥 Erreur fatale: ${error.message}`));
    
    // Sauvegarder l'échec en mémoire
    const memory = getMemoryManager();
    memory.addEpisode('agent_failure', {
      task,
      error: error.message,
      duration: Date.now() - startTime
    });
    
    process.exit(1);
  }
} 