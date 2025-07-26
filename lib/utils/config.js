import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { askInput } from './prompt.js';
import { selectOpenRouterModel, getModelInfo } from './models.js';

const CONFIG_FILE = path.join(os.homedir(), '.tera-config.json');

/**
 * Providers supportés
 */
export const PROVIDERS = {
  OPENAI: 'openai',
  OPENROUTER: 'openrouter'
};

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG = {
  provider: PROVIDERS.OPENAI,
  openai: {
    apiKey: null,
    model: 'gpt-4o'
  },
  openrouter: {
    apiKey: null,
    model: 'openai/gpt-4o'
  }
};

/**
 * Charge la configuration depuis le fichier
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      const config = JSON.parse(configData);
      
      // Merger avec la configuration par défaut pour s'assurer que toutes les clés existent
      return {
        ...DEFAULT_CONFIG,
        ...config,
        openai: { ...DEFAULT_CONFIG.openai, ...config.openai },
        openrouter: { ...DEFAULT_CONFIG.openrouter, ...config.openrouter }
      };
    }
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Erreur lors du chargement de la configuration: ${error.message}`));
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Sauvegarde la configuration dans le fichier
 */
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Erreur lors de la sauvegarde: ${error.message}`));
    return false;
  }
}

/**
 * Récupère la configuration active
 */
export function getActiveConfig() {
  const config = loadConfig();
  const provider = config.provider || PROVIDERS.OPENAI;
  
  // Vérifier les variables d'environnement qui ont priorité
  const envOpenAIKey = process.env.OPENAI_API_KEY;
  const envOpenRouterKey = process.env.OPENROUTER_API_KEY;
  
  if (provider === PROVIDERS.OPENAI) {
    return {
      provider: PROVIDERS.OPENAI,
      apiKey: envOpenAIKey || config.openai.apiKey,
      model: config.openai.model,
      baseURL: null
    };
  } else {
    return {
      provider: PROVIDERS.OPENROUTER,
      apiKey: envOpenRouterKey || config.openrouter.apiKey,
      model: config.openrouter.model,
      baseURL: 'https://openrouter.ai/api/v1'
    };
  }
}

/**
 * Vérifie si la configuration est complète
 */
export function isConfigured() {
  const activeConfig = getActiveConfig();
  return !!activeConfig.apiKey;
}

/**
 * Valide une clé API
 */
function validateApiKey(key, provider) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  if (provider === PROVIDERS.OPENAI) {
    // Les clés OpenAI commencent par "sk-"
    if (!key.startsWith('sk-')) {
      return false;
    }
  } else if (provider === PROVIDERS.OPENROUTER) {
    // Les clés OpenRouter commencent par "sk-or-"
    if (!key.startsWith('sk-or-')) {
      return false;
    }
  }
  
  // Longueur minimum raisonnable
  if (key.length < 20) {
    return false;
  }
  
  return true;
}

/**
 * Sélection du provider
 */
async function selectProvider() {
  console.log(chalk.blue('🔧 Sélection du provider d\'IA\n'));
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Quel provider voulez-vous utiliser ?',
      choices: [
        {
          name: `${chalk.green('OpenAI')} ${chalk.gray('- GPT-4o, GPT-4, GPT-3.5 (API officielle)')}`,
          value: PROVIDERS.OPENAI,
          short: 'OpenAI'
        },
        {
          name: `${chalk.blue('OpenRouter')} ${chalk.gray('- Accès à tous les modèles (GPT, Claude, Llama, etc.)')}`,
          value: PROVIDERS.OPENROUTER,
          short: 'OpenRouter'
        }
      ],
      default: PROVIDERS.OPENAI
    }
  ]);
  
  return answer.provider;
}

/**
 * Configuration d'OpenAI
 */
async function configureOpenAI() {
  console.log(chalk.green('\n🤖 Configuration d\'OpenAI'));
  console.log(chalk.gray('Obtenez votre clé API sur: https://platform.openai.com/api-keys\n'));
  
  let apiKey;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      apiKey = await askInput('Entrez votre clé API OpenAI:', true);
      
      if (!apiKey) {
        console.log(chalk.yellow('⚠️  Clé API requise pour continuer'));
        attempts++;
        continue;
      }
      
      if (!validateApiKey(apiKey, PROVIDERS.OPENAI)) {
        console.log(chalk.red('❌ Format de clé API invalide (doit commencer par "sk-")'));
        attempts++;
        continue;
      }
      
      break;
    } catch (error) {
      console.log(chalk.red(`❌ Erreur: ${error.message}`));
      attempts++;
    }
  }
  
  if (attempts >= maxAttempts) {
    throw new Error(`Échec de la configuration après ${maxAttempts} tentatives`);
  }
  
  // Sélection du modèle OpenAI
  const modelAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Quel modèle OpenAI voulez-vous utiliser ?',
      choices: [
        { name: 'GPT-4o (recommandé)', value: 'gpt-4o', short: 'GPT-4o' },
        { name: 'GPT-4o Mini (plus rapide)', value: 'gpt-4o-mini', short: 'GPT-4o Mini' },
        { name: 'GPT-4 Turbo', value: 'gpt-4-turbo', short: 'GPT-4 Turbo' },
        { name: 'GPT-4', value: 'gpt-4', short: 'GPT-4' },
        { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', short: 'GPT-3.5 Turbo' }
      ],
      default: 'gpt-4o'
    }
  ]);
  
  return {
    apiKey,
    model: modelAnswer.model
  };
}

/**
 * Configuration d'OpenRouter
 */
async function configureOpenRouter() {
  console.log(chalk.blue('\n🌐 Configuration d\'OpenRouter'));
  console.log(chalk.gray('Obtenez votre clé API sur: https://openrouter.ai/keys\n'));
  
  let apiKey;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      apiKey = await askInput('Entrez votre clé API OpenRouter:', true);
      
      if (!apiKey) {
        console.log(chalk.yellow('⚠️  Clé API requise pour continuer'));
        attempts++;
        continue;
      }
      
      if (!validateApiKey(apiKey, PROVIDERS.OPENROUTER)) {
        console.log(chalk.red('❌ Format de clé API invalide (doit commencer par "sk-or-")'));
        attempts++;
        continue;
      }
      
      break;
    } catch (error) {
      console.log(chalk.red(`❌ Erreur: ${error.message}`));
      attempts++;
    }
  }
  
  if (attempts >= maxAttempts) {
    throw new Error(`Échec de la configuration après ${maxAttempts} tentatives`);
  }
  
  // Sélection du modèle OpenRouter avec interface interactive
  console.log(chalk.blue('\n🎯 Sélection du modèle'));
  const model = await selectOpenRouterModel();
  
  return {
    apiKey,
    model
  };
}

/**
 * Change uniquement le modèle du provider actuel
 */
export async function changeModel() {
  console.log(chalk.blue('🎯 Changement de modèle'));
  
  const config = loadConfig();
  const activeConfig = getActiveConfig();
  
  if (!isConfigured()) {
    console.log(chalk.red('❌ Aucun provider configuré. Utilisez "tera config" d\'abord.'));
    return;
  }
  
  console.log(chalk.gray(`Provider actuel: ${chalk.cyan(activeConfig.provider)}`));
  console.log(chalk.gray(`Modèle actuel: ${chalk.cyan(activeConfig.model)}`));
  
  let newModel;
  
  if (activeConfig.provider === PROVIDERS.OPENAI) {
    console.log(chalk.green('\n🤖 Sélection d\'un nouveau modèle OpenAI'));
    
    const modelAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Quel modèle OpenAI voulez-vous utiliser ?',
        choices: [
          { name: 'GPT-4o (recommandé)', value: 'gpt-4o', short: 'GPT-4o' },
          { name: 'GPT-4o Mini (plus rapide)', value: 'gpt-4o-mini', short: 'GPT-4o Mini' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo', short: 'GPT-4 Turbo' },
          { name: 'GPT-4', value: 'gpt-4', short: 'GPT-4' },
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', short: 'GPT-3.5 Turbo' }
        ],
        default: activeConfig.model
      }
    ]);
    
    newModel = modelAnswer.model;
    config.openai.model = newModel;
    
  } else if (activeConfig.provider === PROVIDERS.OPENROUTER) {
    console.log(chalk.blue('\n🌐 Sélection d\'un nouveau modèle OpenRouter'));
    
    newModel = await selectOpenRouterModel();
    config.openrouter.model = newModel;
  }
  
  if (newModel === activeConfig.model) {
    console.log(chalk.yellow('ℹ️  Aucun changement - même modèle sélectionné'));
    return;
  }
  
  // Sauvegarder la configuration
  if (saveConfig(config)) {
    console.log(chalk.green(`✅ Modèle changé avec succès !`));
    console.log(chalk.gray(`   Ancien: ${activeConfig.model}`));
    console.log(chalk.gray(`   Nouveau: ${chalk.cyan(newModel)}`));
    
    // Afficher les informations du nouveau modèle si c'est OpenRouter
    if (activeConfig.provider === PROVIDERS.OPENROUTER) {
      try {
        const modelInfo = await getModelInfo(newModel);
        if (modelInfo) {
          console.log(chalk.blue('\n📋 Informations du nouveau modèle:'));
          console.log(chalk.gray(`   Nom: ${modelInfo.name}`));
          if (modelInfo.description) {
            console.log(chalk.gray(`   Description: ${modelInfo.description.substring(0, 100)}...`));
          }
          if (modelInfo.context_length) {
            console.log(chalk.gray(`   Contexte: ${modelInfo.context_length.toLocaleString()} tokens`));
          }
          if (modelInfo.pricing && modelInfo.pricing.prompt) {
            console.log(chalk.gray(`   Prix: $${modelInfo.pricing.prompt}/1K prompt, $${modelInfo.pricing.completion}/1K completion`));
          }
        }
      } catch (error) {
        // Ignorer les erreurs de récupération des informations
      }
    }
    
    console.log('');
  } else {
    console.error(chalk.red('❌ Erreur lors de la sauvegarde du nouveau modèle'));
  }
}

/**
 * Demande et configure la configuration complète
 */
export async function setupConfig(force = false) {
  if (!force && isConfigured()) {
    return getActiveConfig();
  }
  
  console.log(chalk.blue('\n🔧 Configuration de Tera'));
  console.log(chalk.gray('Configurons votre provider d\'IA pour utiliser Tera.\n'));
  
  try {
    // Sélectionner le provider
    const provider = await selectProvider();
    
    let providerConfig;
    if (provider === PROVIDERS.OPENAI) {
      providerConfig = await configureOpenAI();
    } else {
      providerConfig = await configureOpenRouter();
    }
    
    // Charger la configuration existante
    const config = loadConfig();
    
    // Mettre à jour la configuration
    config.provider = provider;
    if (provider === PROVIDERS.OPENAI) {
      config.openai = providerConfig;
    } else {
      config.openrouter = providerConfig;
    }
    
    // Sauvegarder
    if (saveConfig(config)) {
      console.log(chalk.green('✅ Configuration sauvegardée avec succès !'));
      console.log(chalk.gray(`📁 Configuration stockée dans: ${CONFIG_FILE}\n`));
      
      const activeConfig = getActiveConfig();
      console.log(chalk.blue('📋 Configuration active:'));
      console.log(chalk.gray(`   Provider: ${chalk.cyan(activeConfig.provider)}`));
      console.log(chalk.gray(`   Modèle: ${chalk.cyan(activeConfig.model)}`));
      
      if (provider === PROVIDERS.OPENROUTER) {
        try {
          const modelInfo = await getModelInfo(activeConfig.model);
          if (modelInfo && modelInfo.description) {
            console.log(chalk.gray(`   Description: ${modelInfo.description}`));
          }
        } catch (error) {
          // Ignorer les erreurs de récupération des informations du modèle
        }
      }
      
      return activeConfig;
    } else {
      throw new Error('Erreur lors de la sauvegarde');
    }
  } catch (error) {
    console.log(chalk.red(`❌ Erreur de configuration: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Alias pour la compatibilité
 */
export async function setupOpenAIKey(force = false) {
  return setupConfig(force);
}

/**
 * Affiche les informations de configuration
 */
export async function showConfig() {
  const config = loadConfig();
  const activeConfig = getActiveConfig();
  
  const hasEnvOpenAIKey = !!process.env.OPENAI_API_KEY;
  const hasEnvOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  
  console.log(chalk.blue('\n📋 Configuration Tera'));
  console.log(chalk.gray('─'.repeat(50)));
  
  console.log(`Fichier de config: ${chalk.cyan(CONFIG_FILE)}`);
  console.log(`Provider actif: ${chalk.cyan(activeConfig.provider)}`);
  console.log(`Modèle actif: ${chalk.cyan(activeConfig.model)}`);
  
  if (activeConfig.provider === PROVIDERS.OPENROUTER) {
    try {
      const modelInfo = await getModelInfo(activeConfig.model);
      if (modelInfo) {
        if (modelInfo.description) {
          console.log(`Description: ${chalk.gray(modelInfo.description)}`);
        }
        console.log(`Catégorie: ${chalk.gray(modelInfo.category)}`);
        if (modelInfo.context_length) {
          console.log(`Contexte: ${chalk.gray(modelInfo.context_length.toLocaleString())} tokens`);
        }
      }
    } catch (error) {
      // Ignorer les erreurs de récupération des informations du modèle
    }
  }
  
  console.log('\n' + chalk.yellow('Configuration OpenAI:'));
  console.log(`  Variable d'env OPENAI_API_KEY: ${hasEnvOpenAIKey ? chalk.green('✅ Définie') : chalk.red('❌ Non définie')}`);
  console.log(`  Clé dans fichier config: ${config.openai.apiKey ? chalk.green('✅ Définie') : chalk.red('❌ Non définie')}`);
  console.log(`  Modèle: ${chalk.cyan(config.openai.model)}`);
  
  console.log('\n' + chalk.blue('Configuration OpenRouter:'));
  console.log(`  Variable d'env OPENROUTER_API_KEY: ${hasEnvOpenRouterKey ? chalk.green('✅ Définie') : chalk.red('❌ Non définie')}`);
  console.log(`  Clé dans fichier config: ${config.openrouter.apiKey ? chalk.green('✅ Définie') : chalk.red('❌ Non définie')}`);
  console.log(`  Modèle: ${chalk.cyan(config.openrouter.model)}`);
  
  const isConfiguredStatus = isConfigured();
  console.log(`\nStatut: ${isConfiguredStatus ? chalk.green('✅ Configuré') : chalk.red('❌ Non configuré')}`);
  
  if (isConfiguredStatus) {
    const maskedKey = activeConfig.apiKey.substring(0, 7) + '...' + activeConfig.apiKey.substring(activeConfig.apiKey.length - 4);
    console.log(`Clé utilisée: ${chalk.cyan(maskedKey)}`);
  }
  
  console.log();
}

/**
 * Change le provider actif
 */
export async function switchProvider() {
  console.log(chalk.blue('🔄 Changement de provider'));
  
  const newProvider = await selectProvider();
  const config = loadConfig();
  
  // Vérifier si le nouveau provider est configuré
  const providerConfig = config[newProvider];
  if (!providerConfig.apiKey) {
    console.log(chalk.yellow(`⚠️  Le provider ${newProvider} n'est pas encore configuré`));
    
    if (newProvider === PROVIDERS.OPENAI) {
      config.openai = await configureOpenAI();
    } else {
      config.openrouter = await configureOpenRouter();
    }
  }
  
  config.provider = newProvider;
  
  if (saveConfig(config)) {
    console.log(chalk.green(`✅ Provider changé vers ${chalk.cyan(newProvider)}`));
    await showConfig();
  } else {
    console.error(chalk.red('❌ Erreur lors du changement de provider'));
  }
} 