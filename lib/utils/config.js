import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { askInput } from './prompt.js';

const CONFIG_FILE = path.join(os.homedir(), '.tera-config.json');

/**
 * Charge la configuration depuis le fichier
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Erreur lors du chargement de la configuration: ${error.message}`));
  }
  return {};
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
 * Récupère la clé API OpenAI (depuis config ou env)
 */
export function getOpenAIKey() {
  // D'abord vérifier les variables d'environnement
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  // Puis vérifier le fichier de configuration
  const config = loadConfig();
  return config.openaiApiKey || null;
}

/**
 * Sauvegarde la clé API OpenAI
 */
export function saveOpenAIKey(apiKey) {
  const config = loadConfig();
  config.openaiApiKey = apiKey;
  return saveConfig(config);
}

/**
 * Vérifie si la configuration est complète
 */
export function isConfigured() {
  return getOpenAIKey() !== null;
}

/**
 * Valide une clé API OpenAI
 */
function validateApiKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // Les clés OpenAI commencent par "sk-"
  if (!key.startsWith('sk-')) {
    return false;
  }
  
  // Longueur minimum raisonnable
  if (key.length < 20) {
    return false;
  }
  
  return true;
}

/**
 * Demande et configure la clé API OpenAI
 */
export async function setupOpenAIKey(force = false) {
  if (!force && isConfigured()) {
    return getOpenAIKey();
  }

  console.log(chalk.blue('\n🔧 Configuration de Tera'));
  console.log(chalk.gray('Pour utiliser Tera, vous devez configurer votre clé API OpenAI.'));
  console.log(chalk.gray('Obtenez votre clé sur: https://platform.openai.com/api-keys\n'));

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

      if (!validateApiKey(apiKey)) {
        console.log(chalk.red('❌ Format de clé API invalide (doit commencer par "sk-")'));
        attempts++;
        continue;
      }

      // Sauvegarder la clé
      if (saveOpenAIKey(apiKey)) {
        console.log(chalk.green('✅ Clé API sauvegardée avec succès !'));
        console.log(chalk.gray(`📁 Configuration stockée dans: ${CONFIG_FILE}\n`));
        return apiKey;
      } else {
        console.log(chalk.red('❌ Erreur lors de la sauvegarde'));
        attempts++;
      }
    } catch (error) {
      console.log(chalk.red(`❌ Erreur: ${error.message}`));
      attempts++;
    }
  }

  console.log(chalk.red(`❌ Échec de la configuration après ${maxAttempts} tentatives`));
  process.exit(1);
}

/**
 * Affiche les informations de configuration
 */
export function showConfig() {
  const config = loadConfig();
  const hasEnvKey = !!process.env.OPENAI_API_KEY;
  const hasConfigKey = !!config.openaiApiKey;

  console.log(chalk.blue('\n📋 Configuration Tera'));
  console.log(chalk.gray('─'.repeat(30)));
  
  console.log(`Fichier de config: ${chalk.cyan(CONFIG_FILE)}`);
  console.log(`Variable d'env OPENAI_API_KEY: ${hasEnvKey ? chalk.green('✅ Définie') : chalk.red('❌ Non définie')}`);
  console.log(`Clé dans fichier config: ${hasConfigKey ? chalk.green('✅ Définie') : chalk.red('❌ Non définie')}`);
  
  const activeKey = getOpenAIKey();
  console.log(`Clé active: ${activeKey ? chalk.green('✅ Configurée') : chalk.red('❌ Non configurée')}`);
  
  if (activeKey) {
    const maskedKey = activeKey.substring(0, 7) + '...' + activeKey.substring(activeKey.length - 4);
    console.log(`Clé utilisée: ${chalk.cyan(maskedKey)}`);
  }
  
  console.log();
} 