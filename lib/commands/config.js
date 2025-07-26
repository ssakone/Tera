import chalk from 'chalk';
import inquirer from 'inquirer';
import { setupConfig, showConfig, switchProvider, changeModel, getActiveConfig } from '../utils/config.js';
import { getAIInfo } from '../utils/openai.js';

/**
 * Commande config - gère la configuration de Tera
 */
export async function configCommand(options) {
  try {
    // Si l'option --show est utilisée, afficher la configuration actuelle
    if (options.show) {
      await showConfig();
      
      // Afficher des informations supplémentaires sur la configuration active
      const aiInfo = getAIInfo();
      const activeConfig = getActiveConfig();
      
      console.log(chalk.blue('🤖 Informations sur l\'IA active:'));
      console.log(chalk.gray(`   Provider: ${chalk.cyan(aiInfo.provider)}`));
      console.log(chalk.gray(`   Modèle: ${chalk.cyan(aiInfo.model)}`));
      console.log(chalk.gray(`   API disponible: ${aiInfo.hasApiKey ? chalk.green('✅ Oui') : chalk.red('❌ Non')}`));
      
      if (aiInfo.baseURL) {
        console.log(chalk.gray(`   URL de base: ${chalk.cyan(aiInfo.baseURL)}`));
      }
      
      return;
    }

    // Si l'option --switch est utilisée, changer de provider
    if (options.switch) {
      await switchProvider();
      return;
    }

    // Si l'option --model est utilisée, changer de modèle
    if (options.model) {
      await changeModel();
      return;
    }

    // Menu principal de configuration
    if (!options.provider) {
      const mainChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Que voulez-vous faire ?',
          choices: [
            {
              name: `${chalk.green('🔧 Configuration complète')} ${chalk.gray('- Configurer ou reconfigurer Tera')}`,
              value: 'setup',
              short: 'Configuration complète'
            },
            {
              name: `${chalk.blue('🔄 Changer de provider')} ${chalk.gray('- Basculer entre OpenAI et OpenRouter')}`,
              value: 'switch',
              short: 'Changer de provider'
            },
            {
              name: `${chalk.magenta('🎯 Changer de modèle')} ${chalk.gray('- Changer le modèle du provider actuel')}`,
              value: 'model',
              short: 'Changer de modèle'
            },
            {
              name: `${chalk.cyan('📋 Afficher la configuration')} ${chalk.gray('- Voir la configuration actuelle')}`,
              value: 'show',
              short: 'Afficher la configuration'
            }
          ]
        }
      ]);

      switch (mainChoice.action) {
        case 'setup':
          await setupConfig(true);
          break;
        case 'switch':
          await switchProvider();
          break;
        case 'model':
          await changeModel();
          break;
        case 'show':
          await showConfig();
          break;
      }
      
      return;
    }

    // Configuration directe
    console.log(chalk.blue('🔧 Configuration de Tera'));
    console.log(chalk.gray('Cette commande va vous permettre de configurer votre provider d\'IA.\n'));
    
    await setupConfig(true); // Force la reconfiguration
    
    console.log(chalk.green('🎉 Configuration terminée !'));
    console.log(chalk.gray('Vous pouvez maintenant utiliser toutes les commandes de Tera.\n'));
    
    // Afficher un résumé de la configuration
    const finalConfig = getActiveConfig();
    console.log(chalk.blue('📋 Résumé de votre configuration:'));
    console.log(chalk.gray(`   Provider: ${chalk.cyan(finalConfig.provider)}`));
    console.log(chalk.gray(`   Modèle: ${chalk.cyan(finalConfig.model)}`));
    
    console.log(chalk.gray('\n💡 Commandes disponibles:'));
    console.log(chalk.gray('   • tera commit           - Messages de commit intelligents'));
    console.log(chalk.gray('   • tera change <file>    - Modifications de code assistées'));
    console.log(chalk.gray('   • tera config --show    - Afficher la configuration'));
    console.log(chalk.gray('   • tera config --switch  - Changer de provider'));
    console.log(chalk.gray('   • tera config --model   - Changer de modèle\n'));
    
  } catch (error) {
    console.error(chalk.red(`❌ Erreur lors de la configuration: ${error.message}`));
    process.exit(1);
  }
} 