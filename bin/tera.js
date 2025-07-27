#!/usr/bin/env node

// Supprimer les warnings de dépréciation pour une meilleure expérience utilisateur
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  // Ignorer les warnings de dépréciation du module punycode
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return;
  }
  // Afficher les autres warnings
  console.warn(warning.message);
});

import { Command } from 'commander';
import chalk from 'chalk';
import { commitCommand } from '../lib/commands/commit.js';
import { configCommand } from '../lib/commands/config.js';
import { changeCommand } from '../lib/commands/change.js';
import { reviewCommand } from '../lib/commands/review.js';
import { agentCommand } from '../lib/commands/agent.js';

const program = new Command();

program
  .name('tera')
  .description('Assistant CLI utilisant l\'IA (OpenAI/OpenRouter) pour automatiser les tâches de développement')
  .version('1.0.0');

// Commande commit
program
  .command('commit')
  .description('Génère un message de commit intelligent basé sur les changements git')
  .option('-a, --add', 'Ajouter tous les changements (git add .) avant de commiter')
  .option('-y, --yes', 'Accepter automatiquement le message de commit proposé')
  .action(commitCommand);

// Commande config
program
  .command('config')
  .description('Configure les paramètres de Tera (provider et clés API)')
  .option('-s, --show', 'Affiche la configuration actuelle')
  .option('--switch', 'Change de provider (OpenAI ↔ OpenRouter)')
  .option('-m, --model', 'Change le modèle du provider actuel')
  .action(configCommand);

// Commande change
program
  .command('change <file_path> <need>')
  .description('Modifie un fichier selon les besoins spécifiés avec l\'IA')
  .option('-b, --backup', 'Créer une sauvegarde automatique')
  .option('-p, --preview', 'Affiche un aperçu du contenu modifié après application')
  .action(changeCommand);

// Commande review
program
  .command('review')
  .description('Analyse les commits pour détecter les bugs et suggérer des améliorations')
  .option('-c, --commit <hash>', 'Analyser un commit spécifique')
  .option('-l, --last <number>', 'Analyser les N derniers commits (défaut: 1, max: 10)', parseInt)
  .option('-s, --skip <patterns>', 'Ignorer les fichiers par extension (.dart) ou nom (package.json). Séparer par des virgules')
  .action(reviewCommand);

// Commande agent
program
  .command('agent [task]')
  .description('Automatise des tâches de développement avec streaming IA en temps réel')
  .option('--auto', 'Exécution automatique sans confirmation')
  .option('--fast', 'Exécution rapide sans pauses entre les actions')
  .option('--debug', 'Mode debug avec informations détaillées')
  .action(agentCommand);

// Commande memory
program
  .command('memory')
  .description('Affiche les statistiques de la mémoire de l\'agent IA')
  .option('--clear', 'Réinitialise complètement la mémoire')
  .action(async (options) => {
    const { getMemoryManager } = await import('../lib/utils/memory.js');
    const chalk = (await import('chalk')).default;
    
    const memory = getMemoryManager();
    
    if (options.clear) {
      memory.clearMemory();
      console.log(chalk.green('✅ Mémoire réinitialisée avec succès'));
      return;
    }
    
    const stats = memory.getMemoryStats();
    
    console.log(chalk.blue('🧠 Statistiques de la mémoire de l\'agent IA\n'));
    console.log(chalk.white('📚 Mémoire épisodique:'), chalk.cyan(`${stats.episodes} épisode(s)`));
    console.log(chalk.white('🎯 Mémoire sémantique:'), chalk.cyan(`${stats.semanticCategories} catégorie(s)`));
    console.log(chalk.white('⚡ Mémoire procédurale:'), chalk.cyan(`${stats.procedures} procédure(s)`));
    console.log(chalk.white('💾 Taille totale:'), chalk.cyan(`${Math.round(stats.memorySize / 1024)} KB`));
    
    if (stats.episodes > 0) {
      console.log(chalk.gray('\n💡 L\'agent se souviendra de ces expériences pour les prochaines tâches similaires.'));
    } else {
      console.log(chalk.gray('\n💡 Aucune expérience sauvegardée. L\'agent apprendra en travaillant avec vous.'));
    }
  });

// Gestion des erreurs
program.on('command:*', function (operands) {
  console.error(chalk.red(`❌ Commande inconnue: ${operands[0]}`));
  console.log(chalk.yellow('\n📋 Commandes disponibles:'));
  console.log(chalk.blue('  tera commit') + chalk.gray('              - Génère un message de commit intelligent'));
  console.log(chalk.blue('  tera config') + chalk.gray('              - Configure les providers IA'));
  console.log(chalk.blue('  tera config --show') + chalk.gray('        - Affiche la configuration actuelle'));
  console.log(chalk.blue('  tera config --switch') + chalk.gray('      - Change de provider'));
  console.log(chalk.blue('  tera config --model') + chalk.gray('       - Change de modèle'));
  console.log(chalk.blue('  tera change <file> <need>') + chalk.gray('  - Modifie un fichier avec l\'IA (sans backup par défaut)'));
  console.log(chalk.blue('  tera review') + chalk.gray('               - Analyse les commits pour détecter les bugs'));
  console.log(chalk.blue('  tera agent [task]') + chalk.gray('          - Automatise des tâches avec streaming IA'));
  console.log(chalk.blue('  tera memory') + chalk.gray('               - Affiche les statistiques de mémoire de l\'agent'));
  console.log(chalk.gray('\n💡 Utilisez "tera <commande> --help" pour plus d\'informations sur une commande.'));
  process.exit(1);
});

// Message d'aide personnalisé si aucune commande
if (process.argv.length === 2) {
  console.log(chalk.blue('🤖 Tera - Assistant CLI avec IA\n'));
  
  console.log(chalk.yellow('🔧 Providers supportés:'));
  console.log(chalk.green('  • OpenAI') + chalk.gray('     - GPT-4o, GPT-4, GPT-3.5 (API officielle)'));
  console.log(chalk.blue('  • OpenRouter') + chalk.gray('  - Tous les modèles (GPT, Claude, Llama, Gemini, etc.)\n'));
  
  console.log(chalk.yellow('📋 Commandes disponibles:'));
  console.log(chalk.blue('  tera commit') + chalk.gray('                 - Génère un message de commit intelligent'));
  console.log(chalk.blue('  tera config') + chalk.gray('                 - Configure les providers IA'));
  console.log(chalk.blue('  tera config --show') + chalk.gray('           - Affiche la configuration actuelle'));
  console.log(chalk.blue('  tera config --switch') + chalk.gray('         - Change de provider'));
  console.log(chalk.blue('  tera config --model') + chalk.gray('          - Change de modèle'));
  console.log(chalk.blue('  tera change <file> <need>') + chalk.gray('     - Modifie un fichier avec l\'IA'));
  console.log(chalk.blue('  tera review') + chalk.gray('                  - Analyse les commits pour détecter les bugs'));
  console.log(chalk.blue('  tera agent [task]') + chalk.gray('             - Automatise des tâches avec streaming IA (interactif si pas de tâche)'));
  console.log(chalk.blue('  tera memory') + chalk.gray('                   - Affiche les statistiques de mémoire de l\'agent'));
  console.log(chalk.gray('\n💡 Utilisez "tera <commande> --help" pour plus d\'informations.'));
  console.log(chalk.gray('🔗 Documentation: voir le README.md\n'));
  
  console.log(chalk.cyan('✨ Exemples:'));
  console.log(chalk.gray('  tera config                                       # Configuration initiale'));
  console.log(chalk.gray('  tera config --model                               # Changer de modèle'));
  console.log(chalk.gray('  tera commit                                       # Génère un commit intelligent'));
  console.log(chalk.gray('  tera commit -a                                    # Git add + commit intelligent'));
  console.log(chalk.gray('  tera commit -y                                    # Commit intelligent sans confirmation'));
  console.log(chalk.gray('  tera commit -ay                                   # Git add + commit automatique'));
  console.log(chalk.gray('  tera change app.js "ajouter une fonction test"    # Modifie le fichier app.js'));
  console.log(chalk.gray('  tera change app.js "fix bug" --backup             # Modifie avec sauvegarde'));
  console.log(chalk.gray('  tera review                                       # Analyse le dernier commit'));
  console.log(chalk.gray('  tera review --last 3                             # Analyse les 3 derniers commits'));
  console.log(chalk.gray('  tera review --commit abc123                       # Analyse un commit spécifique'));
  console.log(chalk.gray('  tera review --skip ".gradle,.kt"                  # Ignore les fichiers .gradle et .kt'));
  console.log(chalk.gray('  tera agent                                         # Mode interactif'));
  console.log(chalk.gray('  tera agent "créer un composant React Button"      # Automatise avec streaming'));
  console.log(chalk.gray('  tera agent "setup projet Node.js" --auto          # Exécution automatique'));
  console.log(chalk.gray('  tera memory                                       # Voir la mémoire de l\'agent'));
  console.log(chalk.gray('  tera memory --clear                               # Réinitialiser la mémoire'));
  console.log(chalk.gray('  tera config --switch                              # Change de provider\n'));
  
  process.exit(0);
}

program.parse(); 