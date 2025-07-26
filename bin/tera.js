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

const program = new Command();

program
  .name('tera')
  .description('Assistant CLI utilisant l\'IA (OpenAI/OpenRouter) pour automatiser les tâches de développement')
  .version('1.0.0');

// Commande commit
program
  .command('commit')
  .description('Génère un message de commit intelligent basé sur les changements git')
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
  .option('--no-backup', 'Ne pas créer de sauvegarde automatique')
  .option('-p, --preview', 'Affiche un aperçu du contenu modifié après application')
  .action(changeCommand);

// Gestion des erreurs
program.on('command:*', function (operands) {
  console.error(chalk.red(`❌ Commande inconnue: ${operands[0]}`));
  console.log(chalk.yellow('\n📋 Commandes disponibles:'));
  console.log(chalk.blue('  tera commit') + chalk.gray('              - Génère un message de commit intelligent'));
  console.log(chalk.blue('  tera config') + chalk.gray('              - Configure les providers IA'));
  console.log(chalk.blue('  tera config --show') + chalk.gray('        - Affiche la configuration actuelle'));
  console.log(chalk.blue('  tera config --switch') + chalk.gray('      - Change de provider'));
  console.log(chalk.blue('  tera config --model') + chalk.gray('       - Change de modèle'));
  console.log(chalk.blue('  tera change <file> <need>') + chalk.gray('  - Modifie un fichier avec l\'IA'));
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
  console.log(chalk.gray('\n💡 Utilisez "tera <commande> --help" pour plus d\'informations.'));
  console.log(chalk.gray('🔗 Documentation: voir le README.md\n'));
  
  console.log(chalk.cyan('✨ Exemples:'));
  console.log(chalk.gray('  tera config                                       # Configuration initiale'));
  console.log(chalk.gray('  tera config --model                               # Changer de modèle'));
  console.log(chalk.gray('  tera commit                                       # Génère un commit intelligent'));
  console.log(chalk.gray('  tera change app.js "ajouter une fonction test"    # Modifie le fichier app.js'));
  console.log(chalk.gray('  tera config --switch                              # Change de provider\n'));
  
  process.exit(0);
}

program.parse(); 