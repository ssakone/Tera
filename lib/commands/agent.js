import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { execSync } from 'child_process';
import { generateActionPlan, evaluateAndContinue, generateCorrectedPlan } from '../utils/openai.js';
import { askConfirmation, askRecoveryAction, askAdvancedConfirmation } from '../utils/prompt.js';
import { isConfigured, setupConfig, getActiveConfig } from '../utils/config.js';
import { readFile, writeFile, fileExists, createDirectory, applyPatch } from '../utils/file.js';
import { isGitRepository, commitChanges } from '../utils/git.js';
import { getMemoryManager, initializeDefaultMemory } from '../utils/memory.js';

/**
 * Corrige automatiquement les actions malformées
 */
async function correctMalformedAction(action, taskContext = '') {
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
      
      // Suggérer d'utiliser patch_file si le fichier existe déjà
      if (action.params.path && fileExists(action.params.path) && action.params.content) {
        console.log(chalk.yellow(`💡 Suggestion: utiliser patch_file au lieu de modify_file pour des modifications efficaces`));
      }
      break;

    case 'patch_file':
      if (!action.params.path) {
        console.log(chalk.yellow(`⚠️  Action patch_file sans path détectée`));
        const pathMatch = action.description.match(/(?:fichier|file)\s+([a-zA-Z0-9._/-]+)/i);
        if (pathMatch) {
          action.params.path = pathMatch[1];
          console.log(chalk.gray(`  Path déduit: ${action.params.path}`));
        }
      }
      
      if (!action.params.changes || !Array.isArray(action.params.changes) || action.params.changes.length === 0) {
        console.log(chalk.yellow(`⚠️  Action patch_file sans changements valides détectée`));
        console.log(chalk.red(`❌ L'IA n'a pas spécifié les changements précis à apporter`));
        console.log(chalk.gray(`💡 Description: ${action.description}`));
        
        // Au lieu de générer des changements vides, on transforme en action d'analyse
        console.log(chalk.blue(`🔄 Conversion en action analyze_file pour inspecter le fichier`));
        action.action = 'analyze_file';
        action.description = `Analyser ${action.params.path} pour identifier les erreurs à corriger`;
        delete action.params.changes;
      } else {
        // Vérifier si les changements sont vraiment inutiles (exactement identiques)
        const uselessChanges = action.params.changes.filter(change => 
          change.old === change.new
        );
        
        if (uselessChanges.length > 0) {
          console.log(chalk.yellow(`⚠️  Changements inutiles détectés dans patch_file`));
          console.log(chalk.red(`❌ L'IA essaie de remplacer "${uselessChanges[0].old}" par "${uselessChanges[0].new}"`));
          console.log(chalk.gray(`💡 Description: ${action.description}`));
          
          // Conversion en analyse pour comprendre le vrai problème
          console.log(chalk.blue(`🔄 Conversion en action analyze_file pour mieux comprendre l'erreur`));
          action.action = 'analyze_file';
          action.description = `Analyser ${action.params.path} pour comprendre l'erreur d'indentation réelle`;
          delete action.params.changes;
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

    case 'analyze_file':
      // PRIORITÉ 1: Détecter les chemins complets dans l'erreur AVANT toute autre logique
      if (taskContext) {
        const fullPathMatch = taskContext.match(/File\s+"([^"]+)"/i) || 
                             taskContext.match(/fichier\s+"([^"]+)"/i) ||
                             taskContext.match(/\/[^\s]+\.py/i) ||
                             taskContext.match(/\/[^\s,]+\.[a-zA-Z0-9]+/i);
        
        if (fullPathMatch) {
          const detectedPath = fullPathMatch[1] || fullPathMatch[0];
          console.log(chalk.blue(`💡 CHEMIN COMPLET détecté dans l'erreur: ${detectedPath}`));
          action.params.path = detectedPath;
          // Pas besoin de chercher d'autres paths, on a le bon
        }
      }
      
      if (!action.params.path) {
        console.log(chalk.yellow(`⚠️  Action analyze_file sans path détectée`));
        const pathMatch = action.description.match(/(?:fichier|file)\s+([a-zA-Z0-9._/-]+)/i);
        if (pathMatch) {
          action.params.path = pathMatch[1];
          console.log(chalk.gray(`  Path déduit: ${action.params.path}`));
        }
      }
      
              // Détecter les demandes de plages de lignes dans la description (avec contexte large)
        if (action.description) {
          const lineRangeMatch = action.description.match(/ligne(?:s)?\s+(\d+)(?:[-àto\s]+(\d+))?/i);
          if (lineRangeMatch) {
            const startLine = parseInt(lineRangeMatch[1]);
            const endLine = lineRangeMatch[2] ? parseInt(lineRangeMatch[2]) : startLine + 10; // +10 lignes par défaut
            
            // Forcer au minimum 50 lignes de contexte
            const centerLine = Math.floor((startLine + endLine) / 2);
            action.params.startLine = Math.max(1, centerLine - 25);
            action.params.endLine = centerLine + 25;
            
            console.log(chalk.blue(`💡 Plage de lignes détectée: LARGE contexte ${action.params.startLine}-${action.params.endLine} (50+ lignes)`));
          }
          
          // Si erreur d'indentation mentionnée avec une ligne spécifique
          const indentErrorMatch = action.description.match(/(?:indentation|erreur).*ligne\s+(\d+)/i);
          if (indentErrorMatch && !action.params.startLine) {
            const errorLine = parseInt(indentErrorMatch[1]);
            action.params.startLine = Math.max(1, errorLine - 25);
            action.params.endLine = errorLine + 25;
            console.log(chalk.blue(`💡 Contexte d'erreur d'indentation: LARGE contexte ${action.params.startLine}-${action.params.endLine} (50+ lignes)`));
          }
        
        // Pour les gros fichiers, forcer l'utilisation de larges plages si une ligne d'erreur est mentionnée dans la tâche
        if (action.params.path && taskContext) {
          // Rechercher des numéros de ligne dans le contexte complet de la tâche
          const lineMatches = taskContext.match(/line\s+(\d+)/gi) || [];
          if (lineMatches.length > 0) {
            // Prendre le premier numéro de ligne trouvé
            const errorLine = parseInt(lineMatches[0].match(/\d+/)[0]);
            
            // Si l'IA a déjà spécifié des plages, vérifier si elles sont trop petites
            const existingRange = action.params.endLine ? (action.params.endLine - action.params.startLine + 1) : 0;
            const shouldExpand = existingRange < 40; // Moins de 40 lignes = trop petit
            
            if (shouldExpand || !action.params.startLine) {
              // Analyser au minimum 50 lignes autour de l'erreur
              action.params.startLine = Math.max(1, errorLine - 25);
              action.params.endLine = errorLine + 25;
              console.log(chalk.blue(`💡 Erreur détectée ligne ${errorLine}: FORCER analyse large lignes ${action.params.startLine}-${action.params.endLine} (50+ lignes)`));
            }
          }
        }
        
        // Cette logique est maintenant gérée plus haut, pas besoin de répéter
      }
      
      // Vérification stricte des chemins (pas de correction automatique)
      if (action.params.path && !fileExists(action.params.path)) {
        console.log(chalk.yellow(`⚠️  Fichier introuvable: ${action.params.path}`));
        console.log(chalk.gray(`  Suggestion: utiliser exactement les chemins trouvés dans les découvertes`));
        console.log(chalk.red(`❌ L'IA devrait utiliser les chemins exacts des découvertes, pas inventer des chemins`));
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
      // console.log('\n' + chalk.gray('─'.repeat(80)));
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
        case 'patch_file':
          await this.patchFile(step.params);
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
    
    // Debug: afficher le chemin absolu où le fichier sera créé
    const absolutePath = path.resolve(params.path);
    console.log(chalk.gray(`   📝 Création: ${absolutePath}`));
    
    // Créer les dossiers parents si nécessaire
    const dirPath = path.dirname(params.path);
    if (dirPath !== '.' && !fileExists(dirPath)) {
      console.log(chalk.gray(`   📁 Création du dossier: ${path.resolve(dirPath)}`));
      createDirectory(dirPath);
    }
    
    writeFile(params.path, params.content);
  }

  async modifyFile(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    // Debug: afficher le chemin absolu du fichier à modifier
    const absolutePath = path.resolve(params.path);
    console.log(chalk.gray(`   ✏️  Modification: ${absolutePath}`));
    
    if (!fileExists(params.path)) {
      throw new Error(`Fichier non trouvé: ${params.path} (chemin absolu: ${absolutePath})`);
    }
    
    if (params.content) {
      writeFile(params.path, params.content);
    }
  }

  async patchFile(params) {
    if (!params.path || !params.changes) {
      throw new Error('Paramètres manquants: path et changes requis');
    }
    
    if (!Array.isArray(params.changes)) {
      throw new Error('Le paramètre changes doit être un tableau');
    }
    
    // Debug: afficher le chemin absolu du fichier à patcher
    const absolutePath = path.resolve(params.path);
    console.log(chalk.gray(`   🔧 Patch: ${absolutePath}`));
    
    if (!fileExists(params.path)) {
      throw new Error(`Fichier non trouvé: ${params.path} (chemin absolu: ${absolutePath})`);
    }
    
    const result = applyPatch(params.path, params.changes);
    
    if (result.success) {
      console.log(chalk.gray(`  └─ ${result.changesApplied}/${result.totalChanges} changement(s) appliqué(s)`));
    } else {
      throw new Error('Échec de l\'application du patch');
    }
    
    return result;
  }

  async runCommand(params) {
    if (!params.command) {
      throw new Error('Paramètre manquant: command requis');
    }
    
    // Debug: afficher le répertoire d'exécution de la commande
    const workingDir = params.cwd || process.cwd();
    console.log(chalk.gray(`   ⚡ Commande: ${params.command}`));
    console.log(chalk.gray(`   📁 Dans: ${workingDir}`));
    
    try {
      const result = execSync(params.command, { 
        encoding: 'utf8',
        stdio: 'pipe',
        cwd: workingDir
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
    
    // Debug: afficher le répertoire de travail pour la détection des package managers
    console.log(chalk.gray(`   📦 Détection package manager dans: ${process.cwd()}`));
    
    // Détecter le gestionnaire de packages
    let packageManager = 'npm';
    if (fileExists('yarn.lock')) {
      packageManager = 'yarn';
      console.log(chalk.gray(`   ✅ Détecté: yarn.lock`));
    } else if (fileExists('pnpm-lock.yaml')) {
      packageManager = 'pnpm';
      console.log(chalk.gray(`   ✅ Détecté: pnpm-lock.yaml`));
    } else {
      console.log(chalk.gray(`   📋 Aucun lock file détecté, utilisation de npm par défaut`));
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
    
    // Debug: afficher le chemin absolu du dossier à créer
    const absolutePath = path.resolve(params.path);
    console.log(chalk.gray(`   📁 Création dossier: ${absolutePath}`));
    
    createDirectory(params.path);
  }

  async gitCommit(params) {
    if (!params.message) {
      throw new Error('Paramètre manquant: message requis');
    }
    
    // Debug: afficher le répertoire git
    console.log(chalk.gray(`   🔗 Git dans: ${process.cwd()}`));
    
    if (!isGitRepository()) {
      throw new Error('Pas dans un repository git');
    }
    
    // Stager tous les fichiers modifiés
    console.log(chalk.gray(`   📋 Git add dans: ${process.cwd()}`));
    execSync('git add .', { stdio: 'ignore' });
    
    return commitChanges(params.message);
  }

  async analyzeFile(params) {
    if (!params.path) {
      throw new Error('Paramètre manquant: path requis');
    }
    
    // Debug: afficher le chemin analysé et le working directory
    const path = await import('path');
    const absolutePath = path.resolve(params.path);
    
    if (!fileExists(params.path)) {
      throw new Error(`Fichier non trouvé: ${params.path} (chemin absolu: ${absolutePath})`);
    }
    
    const content = readFile(params.path);
    
    // Si une plage de lignes est spécifiée, extraire seulement cette partie
    if (params.startLine !== undefined || params.endLine !== undefined) {
      const lines = content.split('\n');
      const start = Math.max(0, (params.startLine || 1) - 1); // Conversion 1-indexé vers 0-indexé
      const end = Math.min(lines.length, params.endLine || lines.length);
      
      const selectedLines = lines.slice(start, end);
      const numberedContent = selectedLines
        .map((line, index) => `${String(start + index + 1).padStart(3, ' ')}: ${line}`)
        .join('\n');
      
      process.stdout.write(chalk.gray(`(lignes ${start + 1}-${end}, ${selectedLines.length} ligne(s)) `));
      
      // Stocker le contenu avec numéros de ligne
      if (!this.fileMemory) this.fileMemory = {};
      this.fileMemory[params.path] = { content, lines, numberedContent };
      
      return numberedContent;
    } else {
      // Mode complet : afficher avec numéros de ligne si le fichier est petit
      const lines = content.split('\n');
      if (lines.length <= 50) {
        const numberedContent = lines
          .map((line, index) => `${String(index + 1).padStart(3, ' ')}: ${line}`)
          .join('\n');
        
        process.stdout.write(chalk.gray(`(${lines.length} ligne(s) avec numéros) `));
        
        if (!this.fileMemory) this.fileMemory = {};
        this.fileMemory[params.path] = { content, lines, numberedContent };
        
        return numberedContent;
      } else {
        // Fichier trop grand : afficher sans numéros de ligne mais suggérer d'utiliser des plages
        process.stdout.write(chalk.gray(`(${content.length} caractères, ${lines.length} ligne(s)) `));
        console.log(chalk.yellow(`\n💡 Fichier volumineux détecté. Utilisez analyze_file avec startLine/endLine pour cibler une plage spécifique.`));
        
        if (!this.fileMemory) this.fileMemory = {};
        this.fileMemory[params.path] = { content, lines };
        
        return content;
      }
    }
  }

  async listDirectory(params) {
    const { readdirSync } = await import('fs');
    const path = await import('path');
    const dirPath = params.path || '.';
    
    try {
      // Afficher le chemin absolu pour debug
      const absolutePath = path.resolve(dirPath);
      
      const entries = readdirSync(dirPath);
      const result = entries.join('\n');
      process.stdout.write(chalk.gray(`(${entries.length} élément(s) trouvé(s) dans ${absolutePath}) `));
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
        case 'patch_file': actionIcon = '🔧'; break;
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
  
  // console.log(chalk.gray('\n─'.repeat(70)));
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

    // Initialiser la mémoire persistante
    const memory = getMemoryManager();
    initializeDefaultMemory();
    
    // Afficher la configuration active
    const activeConfig = getActiveConfig();
    console.log(chalk.blue(`🤖 Utilisation de ${chalk.cyan(activeConfig.provider)} avec le modèle ${chalk.cyan(activeConfig.model)}`));
    console.log(chalk.blue(`🎯 Tâche: ${chalk.white(task)}`));
    console.log(chalk.blue(`📁 Répertoire de travail: ${chalk.cyan(process.cwd())}`));
    
    // Récupérer le contexte de mémoire pour cette tâche
    const memoryContext = memory.getContextForTask(task);
    if (memoryContext.hasContext) {
      console.log(chalk.magenta(`🧠 Mémoire: ${memoryContext.similarEpisodes.length} épisode(s) similaire(s) trouvé(s)`));
      if (memoryContext.recurringErrors.length > 0) {
        console.log(chalk.yellow(`⚠️  Erreurs récurrentes détectées: ${memoryContext.recurringErrors.length}`));
      }
    }
    console.log();

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
    
    // Debug: vérifier que nous sommes dans le bon working directory
    const currentWorkingDir = process.cwd();
    console.log(chalk.gray(`🔍 Working Directory: ${currentWorkingDir}`));

    // Phase 2: Génération du plan (sans streaming pour éviter les conflits)
    console.log(chalk.blue('\n🤖 Génération du plan d\'actions...'));
    
    const spinner = ora({
      text: 'Analyse et génération du plan...',
      color: 'cyan'
    }).start();
    
    let planResult;
    try {
              planResult = await generateActionPlan(task, discoveryCallback, null, memoryContext); // Pas de streaming
      spinner.succeed(chalk.green('Plan généré avec succès !'));
      
    } catch (error) {
      spinner.fail(chalk.red('Erreur lors de la génération du plan'));
      
      // Proposer des options de récupération pour les erreurs de génération de plan
      console.log(chalk.yellow('\n🔧 L\'IA n\'a pas pu générer un plan valide.'));
      const recovery = await askRecoveryAction(`Erreur de génération: ${error.message}`);
      
      if (recovery.action === 'abort') {
        console.log(chalk.yellow('⏹️  Processus interrompu par l\'utilisateur'));
        return;
      } else if (recovery.action === 'instruct') {
        console.log(chalk.blue('\n🤖 Génération d\'un plan avec vos instructions...'));
        
        const instructSpinner = ora({
          text: 'Génération selon vos instructions...',
          color: 'green'
        }).start();
        
        try {
          planResult = await generateCorrectedPlan(task, recovery.instructions, {
            error: error.message,
            planGeneration: true
          });
          instructSpinner.succeed(chalk.green('Plan selon vos instructions généré'));
        } catch (instructError) {
          instructSpinner.fail(chalk.red('Erreur avec vos instructions'));
          console.error(chalk.red(`❌ ${instructError.message}`));
          console.log(chalk.yellow('⏹️  Processus interrompu'));
          return;
        }
      } else if (recovery.action === 'retry') {
        console.log(chalk.blue('\n🔄 Nouvelle tentative de génération...'));
        
        const retrySpinner = ora({
          text: 'Nouvelle tentative...',
          color: 'cyan'
        }).start();
        
        try {
          planResult = await generateActionPlan(task, discoveryCallback, null, memoryContext);
          retrySpinner.succeed(chalk.green('Plan généré avec succès'));
        } catch (retryError) {
          retrySpinner.fail(chalk.red('Échec de la nouvelle tentative'));
          console.error(chalk.red(`❌ ${retryError.message}`));
          console.log(chalk.yellow('⏹️  Processus interrompu après échec de la nouvelle tentative'));
          return;
        }
      } else {
        console.log(chalk.yellow('⏹️  Processus interrompu'));
        return;
      }
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
              case 'patch_file': actionIcon = '🔧'; break;
              case 'run_command': actionIcon = '⚡'; break;
              case 'install_package': actionIcon = '📦'; break;
              case 'create_directory': actionIcon = '📁'; break;
              case 'git_commit': actionIcon = '🔗'; break;
            }
            console.log(`${chalk.cyan(stepNum + '.')} ${actionIcon} ${chalk.white(action.description)}`);
          });
        }

        // console.log(chalk.gray('\n─'.repeat(70)));
      }

      // Demander confirmation (sauf si --auto)
      if (!options.auto) {
        // Vérifier si le plan a des problèmes (pas d'actions, pas de contenu utile)
        const hasActions = currentPlan.actions && currentPlan.actions.length > 0;
        const hasAnalysis = currentPlan.analysis && currentPlan.analysis.trim() !== '';
        const hasStrategy = currentPlan.strategy && currentPlan.strategy.trim() !== '';
        const hasReasoning = currentPlan.reasoning && currentPlan.reasoning.trim() !== '';
        
        // Détecter si l'IA demande des informations supplémentaires ou est vraiment bloquée
        const needsMoreInfo = !hasActions && hasAnalysis && (
          currentPlan.analysis.toLowerCase().includes('plus de détails') ||
          currentPlan.analysis.toLowerCase().includes('information') ||
          currentPlan.analysis.toLowerCase().includes('spécifique') ||
          currentPlan.analysis.toLowerCase().includes('erreur mentionnée') ||
          currentPlan.analysis.toLowerCase().includes('quel') ||
          currentPlan.analysis.toLowerCase().includes('quelle') ||
          currentPlan.analysis.toLowerCase().includes('faudrait')
        );
        
        // Un plan est valide s'il a des actions ET une explication, OU s'il demande des informations
        let hasProblem = !hasActions && !needsMoreInfo && (!hasAnalysis && !hasStrategy && !hasReasoning);
        
        // Vérifications supplémentaires pour détecter des plans vraiment problématiques
        if (hasActions) {
          const suspiciousActions = currentPlan.actions.filter(action => {
            // Actions sans paramètres requis
            if (action.action === 'analyze_file' && !action.params?.path) return true;
            if (action.action === 'create_file' && (!action.params?.path || !action.params?.content)) return true;
            if (action.action === 'run_command' && !action.params?.command) return true;
            return false;
          });
          
          // Si toutes les actions sont suspectes, c'est un problème
          if (suspiciousActions.length === currentPlan.actions.length) {
            hasProblem = true;
          }
        }
        
        // Si l'IA demande des informations, on traite cela comme une fin normale
        if (needsMoreInfo) {
          console.log(chalk.bgBlue.white.bold('\n 💬 L\'IA DEMANDE DES INFORMATIONS SUPPLÉMENTAIRES '));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(chalk.blue('🤖 Analyse de l\'IA:'));
          console.log(chalk.white(`   ${currentPlan.analysis}`));
          console.log(chalk.yellow('\n💡 L\'IA a besoin de plus d\'informations pour continuer.'));
          console.log(chalk.gray('   Précisez votre demande ou utilisez une nouvelle commande agent.'));
          console.log(chalk.gray(`⏱️  Temps total: ${Math.round((Date.now() - globalStartTime) / 1000)}s`));
          console.log(chalk.gray(`📊 ${totalActions} action(s) exécutée(s) au total`));
          console.log(chalk.gray('─'.repeat(60)));
          return;
        }

        if (hasProblem) {
          console.log(chalk.red('\n⚠️  Problème détecté avec le plan généré'));
          
          // Debug: expliquer pourquoi le plan est considéré comme problématique
          if (options.debug) {
            console.log(chalk.gray('\n[DEBUG] Raisons du problème détecté:'));
            console.log(chalk.gray(`  - Actions: ${hasActions ? '✅' : '❌'} (${currentPlan.actions?.length || 0})`));
            console.log(chalk.gray(`  - Analysis: ${hasAnalysis ? '✅' : '❌'}`));
            console.log(chalk.gray(`  - Strategy: ${hasStrategy ? '✅' : '❌'}`));
            console.log(chalk.gray(`  - Reasoning: ${hasReasoning ? '✅' : '❌'}`));
            console.log(chalk.gray(`  - Demande d'infos: ${needsMoreInfo ? '✅' : '❌'}`));
            if (hasActions) {
              const suspicious = currentPlan.actions.filter(action => {
                if (action.action === 'analyze_file' && !action.params?.path) return true;
                if (action.action === 'create_file' && (!action.params?.path || !action.params?.content)) return true;
                if (action.action === 'run_command' && !action.params?.command) return true;
                return false;
              });
              console.log(chalk.gray(`  - Actions suspectes: ${suspicious.length}/${currentPlan.actions.length}`));
            }
          }
          
          const contextMessage = !hasActions ? 
            'Plan sans actions valides' : 
            'Plan sans explication (analysis/strategy/reasoning manquant)';
          const recovery = await askRecoveryAction(contextMessage);
          
          if (recovery.action === 'abort') {
            console.log(chalk.yellow('⏹️  Processus interrompu par l\'utilisateur'));
            return;
          } else if (recovery.action === 'instruct') {
            console.log(chalk.blue('\n🤖 Génération d\'un nouveau plan avec vos instructions...'));
            
            const correctionSpinner = ora({
              text: 'Génération du plan corrigé...',
              color: 'yellow'
            }).start();
            
            try {
              const correctedPlanResult = await generateCorrectedPlan(task, recovery.instructions, {
                previousPlans,
                executionResults,
                planNumber
              });
              correctionSpinner.succeed(chalk.green('Plan corrigé généré'));
              
              currentPlan = correctedPlanResult.plan;
              
              // Afficher le nouveau plan
              console.log(chalk.bgYellow.black.bold('\n 📋 PLAN CORRIGÉ SELON VOS INSTRUCTIONS '));
              console.log(chalk.gray('─'.repeat(70)));
              
              if (currentPlan.analysis) {
                console.log(chalk.blue('\n🔍 Nouvelle analyse:'));
                console.log(chalk.white(`   ${currentPlan.analysis}`));
              }
              
              if (currentPlan.reasoning) {
                console.log(chalk.blue('\n💭 Prise en compte de vos instructions:'));
                console.log(chalk.white(`   ${currentPlan.reasoning}`));
              }
              
              if (currentPlan.strategy) {
                console.log(chalk.blue('\n📋 Nouvelle stratégie:'));
                console.log(chalk.white(`   ${currentPlan.strategy}`));
              }

              if (currentPlan.actions && currentPlan.actions.length > 0) {
                console.log(chalk.blue(`\n📝 ${currentPlan.actions.length} action(s) corrigée(s):`));
                currentPlan.actions.forEach((action, index) => {
                  const stepNum = `${index + 1}`.padStart(2, ' ');
                  let actionIcon = '📝';
                  switch (action.action) {
                    case 'create_file': actionIcon = '📄'; break;
                    case 'modify_file': actionIcon = '✏️'; break;
                    case 'patch_file': actionIcon = '🔧'; break;
                    case 'run_command': actionIcon = '⚡'; break;
                    case 'install_package': actionIcon = '📦'; break;
                    case 'create_directory': actionIcon = '📁'; break;
                    case 'git_commit': actionIcon = '🔗'; break;
                  }
                  console.log(`${chalk.cyan(stepNum + '.')} ${actionIcon} ${chalk.white(action.description)}`);
                });
              }
              console.log(chalk.gray('\n─'.repeat(70)));
              
            } catch (error) {
              correctionSpinner.fail(chalk.red('Erreur lors de la correction'));
              console.error(chalk.red(`❌ ${error.message}`));
              console.log(chalk.yellow('⏹️  Processus interrompu'));
              return;
            }
          } else if (recovery.action === 'retry') {
            console.log(chalk.blue('\n🔄 Nouvelle tentative de génération...'));
            
            const retrySpinner = ora({
              text: 'Nouvelle génération du plan...',
              color: 'cyan'
            }).start();
            
            try {
              const retryResult = await evaluateAndContinue(task, executionResults, previousPlans);
              retrySpinner.succeed(chalk.green('Nouveau plan généré'));
              currentPlan = retryResult.plan;
            } catch (error) {
              retrySpinner.fail(chalk.red('Échec de la nouvelle tentative'));
              console.error(chalk.red(`❌ ${error.message}`));
              console.log(chalk.yellow('⏹️  Processus interrompu'));
              return;
            }
          }
        }

        // Demander confirmation finale
        const confirmed = await askConfirmation(`\n🚀 Voulez-vous exécuter ${planNumber === 1 ? 'ce plan d\'actions' : 'ces actions supplémentaires'} ?`);
        if (!confirmed) {
          // Proposer des options de récupération même après refus
          const recovery = await askRecoveryAction('L\'utilisateur a refusé d\'exécuter le plan');
          
          if (recovery.action === 'abort') {
            console.log(chalk.yellow('⏹️  Exécution annulée par l\'utilisateur'));
            return;
          } else if (recovery.action === 'instruct') {
            console.log(chalk.blue('\n🤖 Génération d\'un nouveau plan avec vos instructions...'));
            
            const instructSpinner = ora({
              text: 'Génération selon vos instructions...',
              color: 'magenta'
            }).start();
            
            try {
              const instructedPlanResult = await generateCorrectedPlan(task, recovery.instructions, {
                previousPlans,
                executionResults,
                planNumber,
                userRefused: true
              });
              instructSpinner.succeed(chalk.green('Plan selon vos instructions généré'));
              
              currentPlan = instructedPlanResult.plan;
              
              // Afficher le plan basé sur les instructions
              console.log(chalk.bgCyan.black.bold('\n 📋 NOUVEAU PLAN SELON VOS INSTRUCTIONS '));
              console.log(chalk.gray('─'.repeat(70)));
              
              if (currentPlan.analysis) {
                console.log(chalk.blue('\n🔍 Analyse:'));
                console.log(chalk.white(`   ${currentPlan.analysis}`));
              }
              
              if (currentPlan.strategy) {
                console.log(chalk.blue('\n📋 Stratégie:'));
                console.log(chalk.white(`   ${currentPlan.strategy}`));
              }

              if (currentPlan.actions && currentPlan.actions.length > 0) {
                console.log(chalk.blue(`\n📝 ${currentPlan.actions.length} action(s):`));
                currentPlan.actions.forEach((action, index) => {
                  const stepNum = `${index + 1}`.padStart(2, ' ');
                  let actionIcon = '📝';
                  switch (action.action) {
                    case 'create_file': actionIcon = '📄'; break;
                    case 'modify_file': actionIcon = '✏️'; break;
                    case 'patch_file': actionIcon = '🔧'; break;
                    case 'run_command': actionIcon = '⚡'; break;
                    case 'install_package': actionIcon = '📦'; break;
                    case 'create_directory': actionIcon = '📁'; break;
                    case 'git_commit': actionIcon = '🔗'; break;
                  }
                  console.log(`${chalk.cyan(stepNum + '.')} ${actionIcon} ${chalk.white(action.description)}`);
                });
              }
              console.log(chalk.gray('\n─'.repeat(70)));
              
              // Demander confirmation pour le nouveau plan
              const newConfirmed = await askConfirmation('\n🚀 Voulez-vous exécuter ce nouveau plan ?');
              if (!newConfirmed) {
                console.log(chalk.yellow('⏹️  Exécution annulée définitivement'));
                return;
              }
              
            } catch (error) {
              instructSpinner.fail(chalk.red('Erreur lors de la génération avec instructions'));
              console.error(chalk.red(`❌ ${error.message}`));
              console.log(chalk.yellow('⏹️  Processus interrompu'));
              return;
            }
          } else {
            console.log(chalk.yellow('⏹️  Exécution annulée'));
            return;
          }
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
            // Debug: afficher l'action avant exécution (seulement en mode debug)
            if (options.debug) {
              console.log(chalk.gray(`\n[DEBUG] Action générée:`));
              console.log(chalk.gray(`  Type: ${action.action}`));
              console.log(chalk.gray(`  Description: ${action.description}`));
              console.log(chalk.gray(`  Paramètres: ${JSON.stringify(action.params || {}, null, 2)}`));
            }
            
            // Corriger les actions malformées
            const correctedAction = await correctMalformedAction(action, task);
            if (correctedAction !== action && options.debug) {
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
            
            // Debug: afficher les détails de l'erreur (seulement en mode debug)
            if (options.debug) {
              console.log(chalk.gray(`[DEBUG] Action échouée:`));
              console.log(chalk.gray(`  Type: ${action.action}`));
              console.log(chalk.gray(`  Paramètres reçus: ${JSON.stringify(action.params || {}, null, 2)}`));
            }
            
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

        // Sauvegarder cet épisode dans la mémoire persistante
        memory.addEpisode(
          task, 
          currentPlan.actions, 
          planResults, 
          { 
            planNumber, 
            executionTime: planExecutionTime,
            model: activeConfig.model,
            provider: activeConfig.provider
          }
        );

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
          console.log(chalk.gray('💡 L\'agent semble tourner en boucle. Vérifiez la complexité de votre tâche.'));
          break;
        }
        
        // Détection de boucles d'erreurs répétitives
        const recentErrors = executionResults.slice(-3).flatMap(r => 
          r.results ? r.results.filter(ar => !ar.success).map(ar => ar.error) : []
        );
        const duplicateErrors = recentErrors.filter((error, index) => 
          recentErrors.indexOf(error) !== index
        );
        
        if (duplicateErrors.length > 0) {
          console.log(chalk.red('\n🔄 Boucle d\'erreur détectée !'));
          console.log(chalk.yellow(`   L'agent répète les erreurs: ${duplicateErrors[0]}`));
          console.log(chalk.gray('💡 Arrêt pour éviter la répétition infinie.'));
          break;
        }
        
        // Détection de boucles d'actions répétitives
        const recentActions = executionResults.slice(-3).flatMap(r => 
          r.results ? r.results.map(ar => {
            // Créer une clé unique pour chaque action
            const actionKey = ar.action ? `${ar.action.action}:${ar.action.params?.path || ''}:${ar.action.params?.startLine || ''}:${ar.action.params?.endLine || ''}` : '';
            return actionKey;
          }) : []
        ).filter(key => key); // Filtrer les clés vides
        
        // Compter les occurrences de chaque action
        const actionCounts = {};
        recentActions.forEach(actionKey => {
          actionCounts[actionKey] = (actionCounts[actionKey] || 0) + 1;
        });
        
        // Détecter les actions répétées plus de 2 fois
        const repeatedActions = Object.entries(actionCounts).filter(([key, count]) => count >= 3);
        
        if (repeatedActions.length > 0) {
          console.log(chalk.red('\n🔄 Boucle d\'action détectée !'));
          console.log(chalk.yellow(`   L'agent répète la même action: ${repeatedActions[0][0]}`));
          console.log(chalk.gray('💡 Arrêt pour éviter la répétition infinie.'));
          console.log(chalk.blue('\n📊 Résumé: L\'erreur semble persister malgré les tentatives.'));
          console.log(chalk.yellow('   Suggestions:'));
          console.log(chalk.yellow('   • Vérifiez manuellement le fichier'));
          console.log(chalk.yellow('   • L\'erreur pourrait être dans une autre partie du code'));
          console.log(chalk.yellow('   • Essayez une approche différente'));
          break;
        }
        
      } catch (error) {
        evaluationSpinner.fail(chalk.red('Erreur lors de l\'évaluation'));
        console.error(chalk.red(`❌ ${error.message}`));
        
        // Proposer des options de récupération pour les erreurs d'évaluation
        console.log(chalk.yellow('\n🔧 L\'IA a rencontré un problème lors de l\'évaluation.'));
        const recovery = await askRecoveryAction(`Erreur d'évaluation: ${error.message}`);
        
        if (recovery.action === 'abort') {
          console.log(chalk.yellow('⏹️  Processus interrompu par l\'utilisateur'));
          return;
        } else if (recovery.action === 'instruct') {
          console.log(chalk.blue('\n🤖 Génération d\'un plan avec vos instructions...'));
          
          const recoverySpinner = ora({
            text: 'Génération du plan de récupération...',
            color: 'green'
          }).start();
          
          try {
            const recoveryPlanResult = await generateCorrectedPlan(task, recovery.instructions, {
              previousPlans,
              executionResults,
              planNumber,
              error: error.message
            });
            recoverySpinner.succeed(chalk.green('Plan de récupération généré'));
            
            currentPlan = recoveryPlanResult.plan;
            planNumber++;
            
            // Afficher le plan de récupération
            console.log(chalk.bgGreen.black.bold('\n 📋 PLAN DE RÉCUPÉRATION '));
            console.log(chalk.gray('─'.repeat(70)));
            
            if (currentPlan.analysis) {
              console.log(chalk.blue('\n🔍 Analyse:'));
              console.log(chalk.white(`   ${currentPlan.analysis}`));
            }
            
            if (currentPlan.strategy) {
              console.log(chalk.blue('\n📋 Stratégie de récupération:'));
              console.log(chalk.white(`   ${currentPlan.strategy}`));
            }
            console.log(chalk.gray('\n─'.repeat(70)));
            
            // Continuer avec le nouveau plan
            continue;
            
          } catch (recoveryError) {
            recoverySpinner.fail(chalk.red('Échec de la récupération'));
            console.error(chalk.red(`❌ ${recoveryError.message}`));
            console.log(chalk.yellow('⏹️  Processus interrompu définitivement'));
            return;
          }
        } else if (recovery.action === 'retry') {
          console.log(chalk.blue('\n🔄 Nouvelle tentative d\'évaluation...'));
          
          const retrySpinner = ora({
            text: 'Nouvelle tentative d\'évaluation...',
            color: 'blue'
          }).start();
          
          try {
            const retryResult = await evaluateAndContinue(task, executionResults, previousPlans);
            retrySpinner.succeed(chalk.green('Évaluation réussie'));
            currentPlan = retryResult.plan;
            planNumber++;
            continue;
          } catch (retryError) {
            retrySpinner.fail(chalk.red('Échec de la nouvelle tentative'));
            console.error(chalk.red(`❌ ${retryError.message}`));
            console.log(chalk.yellow('⏹️  Processus interrompu après échec de la nouvelle tentative'));
            return;
          }
        } else {
          console.log(chalk.yellow('⏹️  Processus interrompu'));
          return;
        }
      }
    }

  } catch (error) {
    console.error(chalk.red(`\n❌ Erreur inattendue: ${error.message}`));
    console.log(chalk.yellow('\n💡 Le processus a été interrompu. Vérifiez l\'état de votre projet.'));
    process.exit(1);
  }
} 