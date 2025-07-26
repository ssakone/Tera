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

const program = new Command();

program
  .name('tera')
  .description('Assistant CLI utilisant l\'IA pour automatiser les tâches de développement')
  .version('1.0.0');

// Commande commit
program
  .command('commit')
  .description('Génère un message de commit intelligent basé sur les changements git')
  .action(commitCommand);

// Commande config
program
  .command('config')
  .description('Configure les paramètres de Tera (clé API OpenAI)')
  .option('-s, --show', 'Affiche la configuration actuelle')
  .action(configCommand);

// Gestion des erreurs
program.on('command:*', function (operands) {
  console.error(chalk.red(`❌ Commande inconnue: ${operands[0]}`));
  console.log(chalk.yellow('\n📋 Commandes disponibles:'));
  console.log(chalk.blue('  tera commit') + chalk.gray('  - Génère un message de commit intelligent'));
  console.log(chalk.blue('  tera config') + chalk.gray('  - Configure la clé API OpenAI'));
  console.log(chalk.blue('  tera config --show') + chalk.gray('  - Affiche la configuration actuelle'));
  console.log(chalk.gray('\n💡 Utilisez "tera <commande> --help" pour plus d\'informations sur une commande.'));
  process.exit(1);
});

// Message d'aide personnalisé si aucune commande
if (process.argv.length === 2) {
  console.log(chalk.blue('🤖 Tera - Assistant CLI avec l\'IA\n'));
  console.log(chalk.yellow('📋 Commandes disponibles:'));
  console.log(chalk.blue('  tera commit') + chalk.gray('      - Génère un message de commit intelligent'));
  console.log(chalk.blue('  tera config') + chalk.gray('      - Configure la clé API OpenAI'));
  console.log(chalk.blue('  tera config --show') + chalk.gray(' - Affiche la configuration actuelle'));
  console.log(chalk.gray('\n💡 Utilisez "tera <commande> --help" pour plus d\'informations.'));
  console.log(chalk.gray('🔗 Documentation: voir le README.md\n'));
  process.exit(0);
}

program.parse(); 