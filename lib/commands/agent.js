import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { execSync } from 'child_process';
import { generateActionPlan, evaluateAndContinue } from '../utils/openai.js';
import { askConfirmation } from '../utils/prompt.js';
import { isConfigured, setupConfig, getActiveConfig } from '../utils/config.js';
import { readFile, writeFile, fileExists, createDirectory } from '../utils/file.js';
import { isGitRepository, commitChanges } from '../utils/git.js';

/**
 * Corrige automatiquement les actions malformées
 */
async function correctMalformedAction(action) {
  if (!action.params) {
    action.params = {};
  }

  switch (action.action) {
    case 'create_file':
      if (!action.params.path || !action.params.content) {
        console.log(chalk.yellow(`⚠️  Action create_file incomplète détectée`));
        
        // Essayer de déduire le path de la description
        if (!action.params.path) {
          const pathMatch = action.description.match(/(?:fichier|file)\s+([a-zA-Z0-9._/-]+)/i);
          if (pathMatch) {
            action.params.path = pathMatch[1];
            console.log(chalk.gray(`  Path déduit: ${action.params.path}`));
          } else {
            // Fallback basé sur des mots clés dans la description
            if (action.description.toLowerCase().includes('readme')) {
              action.params.path = 'README.md';
            } else if (action.description.toLowerCase().includes('requirements')) {
              action.params.path = 'requirements.txt';
            } else if (action.description.toLowerCase().includes('gitignore')) {
              action.params.path = '.gitignore';
            } else if (action.description.toLowerCase().includes('setup')) {
              action.params.path = 'setup.py';
            } else {
              action.params.path = 'fichier_genere.txt';
            }
            console.log(chalk.gray(`  Path par défaut: ${action.params.path}`));
          }
        }

        // Générer le contenu basé sur le type de fichier
        if (!action.params.content) {
          const filename = action.params.path.toLowerCase();
          
          if (filename === 'readme.md') {
            action.params.content = `# Projet

## Description
Ce projet contient un serveur HTTP Python simple.

## Installation
\`\`\`bash
pip install -r requirements.txt
\`\`\`

## Utilisation
\`\`\`bash
python http_server.py
\`\`\`
`;
          } else if (filename === 'requirements.txt') {
            action.params.content = `# Dépendances Python
# Ajoutez vos dépendances ici
`;
          } else if (filename === '.gitignore') {
            action.params.content = `# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
*.egg-info/
.installed.cfg
*.egg

# Virtual environments
venv/
env/
ENV/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;
          } else if (filename === 'setup.py') {
            action.params.content = `from setuptools import setup, find_packages

setup(
    name="mon-projet",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        # Ajoutez vos dépendances ici
    ],
    author="Votre Nom",
    description="Description du projet",
    python_requires=">=3.6",
)
`;
          } else {
            action.params.content = `# Fichier généré automatiquement
# Description: ${action.description}

# Ajoutez votre contenu ici
`;
          }
          console.log(chalk.gray(`  Contenu généré automatiquement`));
        }
      }
      break;

    case 'modify_file':
      if (!action.params.path) {
        console.log(chalk.yellow(`⚠️  Action modify_file sans path détectée`));
        // Essayer de déduire le path de la description
        const pathMatch = action.description.match(/(?:fichier|file)\s+([a-zA-Z0-9._/-]+)/i);
        if (pathMatch) {
          action.params.path = pathMatch[1];
          console.log(chalk.gray(`  Path déduit: ${action.params.path}`));
        }
      }
      break;

    case 'run_command':
      if (!action.params.command) {
        console.log(chalk.yellow(`⚠️  Action run_command sans commande détectée`));
        // Essayer de déduire la commande de la description
        const cmdMatch = action.description.match(/commande\s+"([^"]+)"/i) ||
                        action.description.match(/exécuter\s+([a-zA-Z0-9\s-]+)/i);
        if (cmdMatch) {
          action.params.command = cmdMatch[1];
          console.log(chalk.gray(`  Commande déduite: ${action.params.command}`));
        }
      }
      if (!action.params.cwd) {
        action.params.cwd = '.';
      }
      break;

    case 'create_directory':
      if (!action.params.path) {
        console.log(chalk.yellow(`⚠️  Action create_directory sans path détectée`));
        const pathMatch = action.description.match(/(?:dossier|directory)\s+([a-zA-Z0-9._/-]+)/i);
        if (pathMatch) {
          action.params.path = pathMatch[1];
          console.log(chalk.gray(`  Path déduit: ${action.params.path}`));
        }
      }
      break;

    case 'git_commit':
      if (!action.params.message) {
        action.params.message = action.description || 'Commit automatique';
        console.log(chalk.gray(`  Message de commit généré: ${action.params.message}`));
      }
      break;
  }

  return action;
}

/**
 * Affichage en streaming avec effacement
 */
class StreamDisplay {
  constructor() {
    this.lines = [];
    this.isStreaming = false;
  }

  start() {
    this.isStreaming = true;
    console.log(chalk.blue('🤖 L\'IA génère le plan d\'actions...\n'));
    console.log(chalk.gray('─'.repeat(80)));
    process.stdout.write(chalk.cyan(''));
  }

  addToken(token) {
    if (this.isStreaming) {
      process.stdout.write(token);
    }
  }

  end() {
    if (this.isStreaming) {
      console.log('\n' + chalk.gray('─'.repeat(80)));
      console.log(chalk.blue('📋 Plan généré ! Préparation de l\'exécution...\n'));
      
      // Effacer le contenu streamé après 2 secondes
      setTimeout(() => {
        // Calculer le nombre de lignes à effacer
        const linesToClear = process.stdout.rows - 5;
        for (let i = 0; i < linesToClear; i++) {
          process.stdout.moveCursor(0, -1);
          process.stdout.clearLine(1);
        }
        process.stdout.cursorTo(0);
      }, 2000);
      
      this.isStreaming = false;
    }
  }
}

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
    if (step.action === 'list_directory' || step.action === 'analyze_file') {
      try {
        switch (step.action) {
          case 'list_directory':
            return await this.listDirectory(step.params);
          case 'analyze_file':
            return await this.analyzeFile(step.params);
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

    try {
      switch (step.action) {
        case 'create_file':
          await this.createFile(step.params);
          break;
        case 'modify_file':
          await this.modifyFile(step.params);
          break;
        case 'run_command':
          await this.runCommand(step.params);
          break;
        case 'install_package':
          await this.installPackage(step.params);
          break;
        case 'create_directory':
          await this.createDir(step.params);
          break;
        case 'git_commit':
          await this.gitCommit(step.params);
          break;
        default:
          throw new Error(`Action d'exécution non supportée: ${step.action}`);
      }
      
      spinner.succeed(chalk.green(`✅ ${step.description}`));
      
    } catch (error) {
      spinner.fail(chalk.red(`❌ Erreur: ${error.message}`));
      throw error;
    }
  }

  async createFile(params) {
    if (!params.path || !params.content) {
      throw new Error('Paramètres manquants: path et content requis');
    }
    
    // Créer les dossiers parents si nécessaire
    const dirPath = path.dirname(params.path);
    if (dirPath !== '.' && !fileExists(dirPath)) {
      createDirectory(dirPath);
    }
    
    writeFile(params.path, params.content);
  }

  async modifyFile(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    if (!fileExists(params.path)) {
      throw new Error(`Fichier non trouvé: ${params.path}`);
    }
    
    if (params.content) {
      writeFile(params.path, params.content);
    }
  }

  async runCommand(params) {
    if (!params.command) {
      throw new Error('Paramètre manquant: command requis');
    }
    
    try {
      const result = execSync(params.command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: params.cwd || process.cwd()
      });
      return result;
    } catch (error) {
      throw new Error(`Commande échouée: ${error.message}`);
    }
  }

  async installPackage(params) {
    if (!params.package) {
      throw new Error('Paramètre manquant: package requis');
    }
    
    // Détecter le gestionnaire de packages
    let packageManager = 'npm';
    if (fileExists('yarn.lock')) {
      packageManager = 'yarn';
    } else if (fileExists('pnpm-lock.yaml')) {
      packageManager = 'pnpm';
    }
    
    const installCmd = packageManager === 'yarn' ? 
      `yarn add ${params.package}` : 
      `${packageManager} install ${params.package}`;
    
    return this.runCommand({ command: installCmd });
  }

  async createDir(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    createDirectory(params.path);
  }

  async gitCommit(params) {
    if (!params.message) {
      throw new Error('Paramètre manquant: message requis');
    }
    
    if (!isGitRepository()) {
      throw new Error('Pas dans un repository git');
    }
    
    // Stager tous les fichiers modifiés
    execSync('git add .', { stdio: 'ignore' });
    
    return commitChanges(params.message);
  }

  async analyzeFile(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    if (!fileExists(params.path)) {
      throw new Error(`Fichier non trouvé: ${params.path}`);
    }
    
    const content = readFile(params.path);
    process.stdout.write(chalk.gray(`(${content.length} caractères) `));
    
    // Optionnel : stocker le contenu pour les actions suivantes
    if (!this.fileMemory) this.fileMemory = {};
    this.fileMemory[params.path] = content;
    
    return content;
  }

  async listDirectory(params) {
    const { readdirSync } = await import('fs');
    const dirPath = params.path || '.';
    
    try {
      const entries = readdirSync(dirPath);
      const result = entries.join('\n');
      process.stdout.write(chalk.gray(`(${entries.length} élément(s) trouvé(s)) `));
      return result;
    } catch (error) {
      throw new Error(`Erreur lors de la lecture du répertoire: ${error.message}`);
    }
  }

  setTotalSteps(total) {
    this.totalSteps = total;
  }
}

/**
 * Affiche le plan découvert de manière structurée
 */
function displayStructuredPlan(plan) {
  console.log(chalk.bgBlue.white.bold(' PLAN D\'ACTIONS BASÉ SUR LA DÉCOUVERTE '));
  console.log(chalk.gray('─'.repeat(70)));
  
  // Afficher l'analyse
  if (plan.analysis) {
    console.log(chalk.blue('\n🔍 Analyse de l\'environnement:'));
    console.log(chalk.white(`   ${plan.analysis}`));
  }
  
  // Afficher la stratégie  
  if (plan.strategy) {
    console.log(chalk.blue('\n📋 Stratégie:'));
    console.log(chalk.white(`   ${plan.strategy}`));
  }
  
  // Afficher les actions
  if (plan.actions && plan.actions.length > 0) {
    console.log(chalk.blue(`\n📝 ${plan.actions.length} action(s) prévue(s):`));
    
    plan.actions.forEach((action, index) => {
      const stepNum = `${index + 1}`.padStart(2, ' ');
      
      // Icône selon le type d'action
      let actionIcon = '📝';
      switch (action.action) {
        case 'create_file': actionIcon = '📄'; break;
        case 'modify_file': actionIcon = '✏️'; break;
        case 'run_command': actionIcon = '⚡'; break;
        case 'install_package': actionIcon = '📦'; break;
        case 'create_directory': actionIcon = '📁'; break;
        case 'git_commit': actionIcon = '🔗'; break;
      }
      
      console.log(`${chalk.cyan(stepNum + '.')} ${actionIcon} ${chalk.white(action.description)}`);
      
      // Afficher les détails selon le type
      if (action.params) {
        switch (action.action) {
          case 'create_file':
          case 'modify_file':
            if (action.params.path) {
              console.log(`     ${chalk.gray('→ Fichier:')} ${chalk.yellow(action.params.path)}`);
            }
            break;
          case 'run_command':
            if (action.params.command) {
              console.log(`     ${chalk.gray('→ Commande:')} ${chalk.yellow(action.params.command)}`);
            }
            break;
          case 'install_package':
            if (action.params.package) {
              console.log(`     ${chalk.gray('→ Package:')} ${chalk.yellow(action.params.package)}`);
            }
            break;
          case 'create_directory':
            if (action.params.path) {
              console.log(`     ${chalk.gray('→ Dossier:')} ${chalk.yellow(action.params.path)}`);
            }
            break;
          case 'git_commit':
            if (action.params.message) {
              console.log(`     ${chalk.gray('→ Message:')} ${chalk.yellow(action.params.message)}`);
            }
            break;
        }
      }
    });
  }
  
  console.log(chalk.gray('\n─'.repeat(70)));
}

/**
 * Commande agent - automatise des tâches de développement
 */
export async function agentCommand(task, options) {
  try {
    // Vérifications préliminaires
    if (!task) {
      console.error(chalk.red('❌ Erreur: Tâche requise'));
      console.log(chalk.yellow('💡 Usage: tera agent "<tâche à automatiser>"'));
      console.log(chalk.gray('\n✨ Exemples:'));
      console.log(chalk.gray('  tera agent "créer un composant React LoginForm"'));
      console.log(chalk.gray('  tera agent "setup un projet Node.js avec Express"'));
      console.log(chalk.gray('  tera agent "ajouter des tests unitaires"'));
      process.exit(1);
    }

    // Vérification et configuration si nécessaire
    if (!isConfigured()) {
      console.log(chalk.yellow('⚠️  Configuration requise pour utiliser cette commande'));
      await setupConfig();
    }

    // Afficher la configuration active
    const activeConfig = getActiveConfig();
    console.log(chalk.blue(`🤖 Utilisation de ${chalk.cyan(activeConfig.provider)} avec le modèle ${chalk.cyan(activeConfig.model)}`));
    console.log(chalk.blue(`🎯 Tâche: ${chalk.white(task)}\n`));

    // Phase 1: Découverte de l'environnement
    console.log(chalk.blue('🔍 Phase de découverte de l\'environnement...\n'));
    
    const executor = new ActionExecutor();
    
    // Callback pour exécuter les actions de découverte
    const discoveryCallback = async (step) => {
      process.stdout.write(chalk.cyan(`🔍 ${step.description}... `));
      
      try {
        const result = await executor.executeAction(step);
        console.log(chalk.green('✅'));
        return result;
      } catch (error) {
        console.log(chalk.red(`❌ ${error.message}`));
        return null;
      }
    };

    // Phase 2: Génération du plan (sans streaming pour éviter les conflits)
    console.log(chalk.blue('\n🤖 Génération du plan d\'actions...'));
    
    const spinner = ora({
      text: 'Analyse et génération du plan...',
      color: 'cyan'
    }).start();
    
    let planResult;
    try {
      planResult = await generateActionPlan(task, discoveryCallback, null); // Pas de streaming
      spinner.succeed(chalk.green('Plan généré avec succès !'));
      
    } catch (error) {
      spinner.fail(chalk.red('Erreur lors de la génération du plan'));
      console.error(chalk.red(`❌ ${error.message}`));
      process.exit(1);
    }

        // Vérifier que le plan est valide
    if (!planResult.plan || !planResult.plan.actions || planResult.plan.actions.length === 0) {
      console.log(chalk.yellow('⚠️  Aucun plan généré. La tâche est peut-être trop vague.'));
      console.log(chalk.gray('💡 Essayez d\'être plus spécifique dans votre demande.'));
      process.exit(0);
    }

    console.log(); // Ligne vide

    // BOUCLE PRINCIPALE: Exécution de plans successifs
    let currentPlan = planResult.plan;
    let executionResults = [];
    let previousPlans = [];
    let planNumber = 1;
    let totalActions = 0;
    const globalStartTime = Date.now();

    while (true) {
      // Afficher le plan structuré
      if (planNumber === 1) {
        displayStructuredPlan(currentPlan);
      } else {
        console.log(chalk.bgMagenta.white.bold(`\n 📋 PLAN ${planNumber} - SUITE DES ACTIONS `));
        console.log(chalk.gray('─'.repeat(70)));
        
        if (currentPlan.analysis) {
          console.log(chalk.blue('\n🔍 Évaluation:'));
          console.log(chalk.white(`   ${currentPlan.analysis}`));
        }
        
        if (currentPlan.reasoning) {
          console.log(chalk.blue('\n💭 Décision:'));
          console.log(chalk.white(`   ${currentPlan.reasoning}`));
        }
        
        if (currentPlan.strategy) {
          console.log(chalk.blue('\n📋 Stratégie pour cette étape:'));
          console.log(chalk.white(`   ${currentPlan.strategy}`));
        }

        if (currentPlan.actions && currentPlan.actions.length > 0) {
          console.log(chalk.blue(`\n📝 ${currentPlan.actions.length} action(s) supplémentaire(s):`));
          currentPlan.actions.forEach((action, index) => {
            const stepNum = `${index + 1}`.padStart(2, ' ');
            let actionIcon = '📝';
            switch (action.action) {
              case 'create_file': actionIcon = '📄'; break;
              case 'modify_file': actionIcon = '✏️'; break;
              case 'run_command': actionIcon = '⚡'; break;
              case 'install_package': actionIcon = '📦'; break;
              case 'create_directory': actionIcon = '📁'; break;
              case 'git_commit': actionIcon = '🔗'; break;
            }
            console.log(`${chalk.cyan(stepNum + '.')} ${actionIcon} ${chalk.white(action.description)}`);
          });
        }

        console.log(chalk.gray('\n─'.repeat(70)));
      }

      // Demander confirmation (sauf si --auto)
      if (!options.auto) {
        const confirmed = await askConfirmation(`\n🚀 Voulez-vous exécuter ${planNumber === 1 ? 'ce plan d\'actions' : 'ces actions supplémentaires'} ?`);
        if (!confirmed) {
          console.log(chalk.yellow('⏹️  Exécution annulée'));
          return;
        }
      }

      // Vérifier si l'IA dit que c'est terminé
      if (currentPlan.status === 'complete') {
        if (currentPlan.actions && currentPlan.actions.length > 0) {
          // Il y a encore des actions à exécuter, on les fait avant de terminer
          console.log(chalk.blue(`\n🏁 Plan final - Finalisation...`));
        } else {
          // Pas d'actions et status complete = vraiment fini
          console.log(chalk.bgGreen.black.bold('\n 🎉 TÂCHE TERMINÉE '));
          console.log(chalk.gray('─'.repeat(50)));
          console.log(chalk.green(`✅ L'IA considère que la tâche est entièrement accomplie`));
          console.log(chalk.white(`💭 Évaluation finale: ${currentPlan.reasoning || 'Tâche complétée avec succès'}`));
          console.log(chalk.gray(`⏱️  Temps total: ${Math.round((Date.now() - globalStartTime) / 1000)}s`));
          console.log(chalk.gray(`📊 ${totalActions} action(s) exécutée(s) au total`));
          console.log(chalk.gray(`🤖 Réalisé avec: ${activeConfig.provider}/${activeConfig.model}`));
          console.log(chalk.gray('─'.repeat(50)));
          break;
        }
      }

      // Exécuter les actions du plan actuel
      if (currentPlan.actions && currentPlan.actions.length > 0) {
        console.log(chalk.blue(`\n🚀 Exécution du plan ${planNumber}...\n`));
        
        const executionExecutor = new ActionExecutor();
        executionExecutor.setTotalSteps(currentPlan.actions.length);
        
        const planStartTime = Date.now();
        const planResults = [];
        
        for (const action of currentPlan.actions) {
          try {
            // Debug: afficher l'action avant exécution
            console.log(chalk.gray(`\n[DEBUG] Action générée:`));
            console.log(chalk.gray(`  Type: ${action.action}`));
            console.log(chalk.gray(`  Description: ${action.description}`));
            console.log(chalk.gray(`  Paramètres: ${JSON.stringify(action.params || {}, null, 2)}`));
            
            // Corriger les actions malformées
            const correctedAction = await correctMalformedAction(action);
            if (correctedAction !== action) {
              console.log(chalk.yellow(`\n🔧 Action corrigée automatiquement:`));
              console.log(chalk.gray(`  Nouveaux paramètres: ${JSON.stringify(correctedAction.params, null, 2)}`));
            }
            
            const result = await executionExecutor.executeAction(correctedAction);
            planResults.push({ action: correctedAction, result, success: true });
            totalActions++;
            
            // Pause entre les actions pour laisser le temps de voir
            if (!options.fast) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (error) {
            console.error(chalk.red(`\n❌ Erreur lors de l'exécution: ${error.message}`));
            
            // Debug: afficher les détails de l'erreur
            console.log(chalk.gray(`[DEBUG] Action échouée:`));
            console.log(chalk.gray(`  Type: ${action.action}`));
            console.log(chalk.gray(`  Paramètres reçus: ${JSON.stringify(action.params || {}, null, 2)}`));
            
            planResults.push({ action, error: error.message, success: false });
            
            // Demander si on continue malgré l'erreur
            if (!options.auto) {
              const continueOnError = await askConfirmation(chalk.yellow('⚠️  Voulez-vous continuer malgré l\'erreur ?'));
              if (!continueOnError) {
                console.log(chalk.yellow('⏹️  Processus interrompu'));
                return;
              }
            }
          }
        }
        
        const planEndTime = Date.now();
        const planExecutionTime = Math.round((planEndTime - planStartTime) / 1000);
        
        executionResults.push({
          planNumber,
          executionTime: planExecutionTime,
          results: planResults,
          plan: currentPlan
        });

        console.log(chalk.green(`\n✅ Plan ${planNumber} terminé en ${planExecutionTime}s`));
      }

      // Si l'IA a dit "complete", on s'arrête maintenant
      if (currentPlan.status === 'complete') {
        console.log(chalk.bgGreen.black.bold('\n 🎉 TÂCHE TERMINÉE '));
        console.log(chalk.gray('─'.repeat(50)));
        console.log(chalk.green(`✅ L'IA considère que la tâche est entièrement accomplie`));
        console.log(chalk.white(`💭 Évaluation finale: ${currentPlan.reasoning || 'Tâche complétée avec succès'}`));
        console.log(chalk.gray(`⏱️  Temps total: ${Math.round((Date.now() - globalStartTime) / 1000)}s`));
        console.log(chalk.gray(`📊 ${totalActions} action(s) exécutée(s) au total`));
        console.log(chalk.gray(`🤖 Réalisé avec: ${activeConfig.provider}/${activeConfig.model}`));
        console.log(chalk.gray('─'.repeat(50)));
        break;
      }

      // L'IA veut continuer - demander le prochain plan
      console.log(chalk.blue('\n🤖 L\'IA évalue la situation et génère le prochain plan...'));
      
      previousPlans.push(currentPlan);
      
      const evaluationSpinner = ora({
        text: 'Évaluation et génération du prochain plan...',
        color: 'magenta'
      }).start();
      
      try {
        const nextPlanResult = await evaluateAndContinue(task, executionResults, previousPlans);
        evaluationSpinner.succeed(chalk.green('Évaluation terminée'));
        
        currentPlan = nextPlanResult.plan;
        planNumber++;
        
        // Vérification de sécurité pour éviter les boucles infinies
        if (planNumber > 10) {
          console.log(chalk.yellow('\n⚠️  Nombre maximum de plans atteint (10). Arrêt par sécurité.'));
          break;
        }
        
      } catch (error) {
        evaluationSpinner.fail(chalk.red('Erreur lors de l\'évaluation'));
        console.error(chalk.red(`❌ ${error.message}`));
        console.log(chalk.yellow('⏹️  Processus interrompu'));
        return;
      }
    }

  } catch (error) {
    console.error(chalk.red(`\n❌ Erreur inattendue: ${error.message}`));
    console.log(chalk.yellow('\n💡 Le processus a été interrompu. Vérifiez l\'état de votre projet.'));
    process.exit(1);
  }
} 