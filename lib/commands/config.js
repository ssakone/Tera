import chalk from 'chalk';
import { setupOpenAIKey, showConfig } from '../utils/config.js';

/**
 * Commande config - gère la configuration de Tera
 */
export async function configCommand(options) {
  try {
    // Si l'option --show est utilisée, afficher la configuration actuelle
    if (options.show) {
      showConfig();
      return;
    }

    // Sinon, configurer ou reconfigurer la clé API
    console.log(chalk.blue('🔧 Configuration de Tera'));
    console.log(chalk.gray('Cette commande va vous permettre de configurer votre clé API OpenAI.\n'));
    
    await setupOpenAIKey(true); // Force la reconfiguration
    
    console.log(chalk.green('🎉 Configuration terminée !'));
    console.log(chalk.gray('Vous pouvez maintenant utiliser "tera commit" pour générer des messages de commit intelligents.\n'));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erreur lors de la configuration: ${error.message}`));
    process.exit(1);
  }
} 