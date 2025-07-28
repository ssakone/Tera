import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { askInput } from './prompt.js';
import { selectOpenRouterModel, getModelInfo } from './models.js';
import { fetchAvailableModels } from './openai.js';

const CONFIG_FILE = path.join(os.homedir(), '.tera-config.json');

/**
 * Récupère la liste des modèles Ollama disponibles
 */
async function fetchOllamaModels(baseURL = 'http://localhost:11434') {
  try {
    const url = baseURL.replace('/v1', '') + '/api/tags';
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Ollama API non trouvée. Vérifiez que Ollama est installé et démarré.');
      } else if (response.status >= 500) {
        throw new Error('Erreur serveur Ollama. Redémarrez Ollama et réessayez.');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    }
    
    const data = await response.json();
    
    if (!data.models || !Array.isArray(data.models)) {
      return [];
    }
    
    return data.models.map(model => ({
      name: model.name,
      size: model.size,
      modified_at: model.modified_at,
      family: model.details?.family || 'Unknown',
      digest: model.digest,
      details: model.details
    })).sort((a, b) => {
      // Trier par date de modification (plus récent en premier)
      if (a.modified_at && b.modified_at) {
        return new Date(b.modified_at) - new Date(a.modified_at);
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(chalk.yellow(`⚠️  Impossible de se connecter à Ollama sur ${baseURL}`));
      console.log(chalk.gray('   Vérifiez que Ollama est installé et démarré:'));
      console.log(chalk.gray('   • Installation: https://ollama.ai'));
      console.log(chalk.gray('   • Démarrage: ollama serve'));
    } else {
      console.log(chalk.yellow(`⚠️  ${error.message}`));
    }
    return [];
  }
}

/**
 * Vérifie si Ollama est accessible
 */
async function checkOllamaAvailability(baseURL = 'http://localhost:11434') {
  try {
    const url = baseURL.replace('/v1', '') + '/api/version';
    const response = await fetch(url, { 
      signal: AbortSignal.timeout(5000) // 5 secondes timeout
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        available: true,
        version: data.version || 'unknown'
      };
    }
    return { available: false };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

/**
 * Providers supportés
 */
export const PROVIDERS = {
  OPENAI: 'openai',
  OPENROUTER: 'openrouter',
  OLLAMA: 'ollama'
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
  },
  ollama: {
    baseURL: 'http://localhost:11434/v1',
    model: 'llama3.2:latest'
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
        openrouter: { ...DEFAULT_CONFIG.openrouter, ...config.openrouter },
        ollama: { ...DEFAULT_CONFIG.ollama, ...config.ollama }
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
  const envOllamaURL = process.env.OLLAMA_BASE_URL;
  
  if (provider === PROVIDERS.OPENAI) {
    return {
      provider: PROVIDERS.OPENAI,
      apiKey: envOpenAIKey || config.openai.apiKey,
      model: config.openai.model,
      baseURL: null
    };
  } else if (provider === PROVIDERS.OPENROUTER) {
    return {
      provider: PROVIDERS.OPENROUTER,
      apiKey: envOpenRouterKey || config.openrouter.apiKey,
      model: config.openrouter.model,
      baseURL: 'https://openrouter.ai/api/v1'
    };
  } else if (provider === PROVIDERS.OLLAMA) {
    return {
      provider: PROVIDERS.OLLAMA,
      apiKey: 'not-needed', // Ollama n'a pas besoin de clé API par défaut
      model: config.ollama.model,
      baseURL: envOllamaURL || config.ollama.baseURL
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
  } else if (provider === PROVIDERS.OLLAMA) {
    // Ollama n'a pas besoin de validation de clé API par défaut
    return true;
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
        },
        {
          name: `${chalk.magenta('Ollama')} ${chalk.gray('- Modèles locaux (Llama, Mistral, CodeLlama, etc.)')}`,
          value: PROVIDERS.OLLAMA,
          short: 'Ollama'
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
  console.log(chalk.blue('🔍 Tentative de récupération des modèles via l\'API...'));
  
  let modelChoices = [];
  try {
    // Essayer de récupérer les modèles avec la nouvelle clé API
    const OpenAI = (await import('openai')).default;
    const tempClient = new OpenAI({ apiKey });
    const response = await tempClient.models.list();
    
    const chatModels = response.data
      .filter(model => {
        const id = model.id.toLowerCase();
        return (
          id.includes('gpt') && 
          !id.includes('instruct') && 
          !id.includes('embedding') && 
          !id.includes('whisper') &&
          !id.includes('tts') &&
          !id.includes('dall-e') &&
          !id.includes('realtime')
        );
      })
      .sort((a, b) => {
        const order = ['gpt-4o', 'gpt-4', 'gpt-3.5'];
        const aPrefix = order.find(prefix => a.id.startsWith(prefix)) || 'zzz';
        const bPrefix = order.find(prefix => b.id.startsWith(prefix)) || 'zzz';
        
        if (aPrefix !== bPrefix) {
          return order.indexOf(aPrefix) - order.indexOf(bPrefix);
        }
        
        return a.id.localeCompare(b.id);
      });
    
    if (chatModels.length > 0) {
      console.log(chalk.green(`✅ ${chatModels.length} modèle(s) récupéré(s) depuis l'API`));
      
      modelChoices = chatModels.map(model => ({
        name: `${model.id} ${model.owned_by ? `(${model.owned_by})` : ''}`,
        value: model.id,
        short: model.id
      }));
    } else {
      throw new Error('Aucun modèle GPT trouvé');
    }
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Impossible de récupérer les modèles: ${error.message}`));
    console.log(chalk.gray('   Utilisation de la liste de modèles par défaut...'));
    
    // Fallback vers la liste statique
    modelChoices = [
      { name: 'GPT-4o (recommandé)', value: 'gpt-4o', short: 'GPT-4o' },
      { name: 'GPT-4o Mini (plus rapide)', value: 'gpt-4o-mini', short: 'GPT-4o Mini' },
      { name: 'GPT-4 Turbo', value: 'gpt-4-turbo', short: 'GPT-4 Turbo' },
      { name: 'GPT-4', value: 'gpt-4', short: 'GPT-4' },
      { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', short: 'GPT-3.5 Turbo' }
    ];
  }
  
  const modelAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Quel modèle OpenAI voulez-vous utiliser ?',
      choices: modelChoices,
      default: modelChoices.find(choice => choice.value === 'gpt-4o')?.value || modelChoices[0]?.value
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
 * Configuration d'Ollama
 */
async function configureOllama() {
  console.log(chalk.magenta('\n🦙 Configuration d\'Ollama'));
  console.log(chalk.gray('Ollama doit être installé et en cours d\'exécution sur votre machine.'));
  console.log(chalk.gray('Installation: https://ollama.ai\n'));
  
  // Vérifier la disponibilité d'Ollama
  console.log(chalk.blue('🔍 Vérification de la disponibilité d\'Ollama...'));
  const availability = await checkOllamaAvailability();
  
  if (availability.available) {
    console.log(chalk.green(`✅ Ollama détecté (version: ${availability.version || 'unknown'})`));
  } else {
    console.log(chalk.yellow('⚠️  Ollama non détecté ou non démarré'));
    console.log(chalk.gray('   La configuration continuera, mais vous devrez démarrer Ollama pour l\'utiliser'));
  }
  
  // Configuration de l'URL de base (optionnel)
  const urlAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'baseURL',
      message: 'URL de base Ollama (appuyez sur Entrée pour utiliser la valeur par défaut):',
      default: 'http://localhost:11434/v1',
      validate: (input) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Veuillez entrer une URL valide';
        }
      }
    }
  ]);
  
  // Récupérer la liste des modèles installés
  console.log(chalk.blue('🔍 Récupération de la liste des modèles Ollama...'));
  const availableModels = await fetchOllamaModels(urlAnswer.baseURL);
  
  let modelChoices = [];
  
  if (availableModels.length > 0) {
    console.log(chalk.green(`✅ ${availableModels.length} modèle(s) trouvé(s)`));
    
    modelChoices = availableModels.map(model => {
      const sizeStr = model.size ? ` (${Math.round(model.size / (1024*1024*1024))}GB)` : '';
      const familyStr = model.family ? ` - ${model.family}` : '';
      return {
        name: `${model.name}${sizeStr}${familyStr}`,
        value: model.name,
        short: model.name
      };
    });
    
    // Ajouter l'option pour un modèle personnalisé
    modelChoices.push({
      name: 'Autre modèle (non installé)...',
      value: 'custom',
      short: 'Personnalisé'
    });
  } else {
    console.log(chalk.yellow('⚠️  Aucun modèle trouvé. Ollama est-il démarré ?'));
    console.log(chalk.gray('   Vous pouvez installer des modèles avec: ollama pull <model>'));
    
    // Proposer des modèles populaires si aucun n'est installé
    modelChoices = [
      { name: 'llama3.2:latest (recommandé)', value: 'llama3.2:latest', short: 'Llama 3.2' },
      { name: 'llama3.1:latest', value: 'llama3.1:latest', short: 'Llama 3.1' },
      { name: 'mistral:latest', value: 'mistral:latest', short: 'Mistral' },
      { name: 'codellama:latest', value: 'codellama:latest', short: 'Code Llama' },
      { name: 'phi3:latest', value: 'phi3:latest', short: 'Phi-3' },
      { name: 'qwen2.5:latest', value: 'qwen2.5:latest', short: 'Qwen 2.5' },
      { name: 'Autre modèle...', value: 'custom', short: 'Personnalisé' }
    ];
  }
  
  // Configuration du modèle
  const modelAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Quel modèle Ollama voulez-vous utiliser ?',
      choices: modelChoices,
      default: availableModels.length > 0 ? availableModels[0].name : 'llama3.2:latest'
    }
  ]);
  
  let finalModel = modelAnswer.model;
  
  // Si l'utilisateur a choisi d'installer un modèle
  if (modelAnswer.model.startsWith('install:')) {
    const modelToInstall = modelAnswer.model.replace('install:', '');
    console.log(chalk.blue(`📥 Installation du modèle ${modelToInstall}...`));
    console.log(chalk.gray('   Cela peut prendre plusieurs minutes selon la taille du modèle...'));
    
    try {
      const { spawn } = await import('child_process');
      const installProcess = spawn('ollama', ['pull', modelToInstall], {
        stdio: 'inherit'
      });
      
      await new Promise((resolve, reject) => {
        installProcess.on('close', (code) => {
          if (code === 0) {
            console.log(chalk.green(`✅ Modèle ${modelToInstall} installé avec succès !`));
            resolve();
          } else {
            reject(new Error(`Installation échouée (code: ${code})`));
          }
        });
        
        installProcess.on('error', (error) => {
          reject(error);
        });
      });
      
      finalModel = modelToInstall;
    } catch (error) {
      console.log(chalk.red(`❌ Erreur lors de l'installation: ${error.message}`));
      console.log(chalk.gray('   Vous pouvez installer le modèle manuellement avec: ollama pull ' + modelToInstall));
      finalModel = modelToInstall; // Utiliser le modèle même si l'installation a échoué
    }
  }
  // Si l'utilisateur a choisi "Autre modèle", demander le nom
  else if (modelAnswer.model === 'custom') {
    const customModelAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'customModel',
        message: 'Entrez le nom du modèle Ollama (ex: llama3.2:7b):',
        validate: (input) => {
          if (!input.trim()) {
            return 'Le nom du modèle est requis';
          }
          return true;
        }
      }
    ]);
    finalModel = customModelAnswer.customModel.trim();
  }
  
  return {
    baseURL: urlAnswer.baseURL,
    model: finalModel
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
    
    // Récupérer dynamiquement la liste des modèles via l'API
    console.log(chalk.blue('🔍 Récupération de la liste des modèles OpenAI...'));
    
    let modelChoices = [];
    try {
      const modelsData = await fetchAvailableModels();
      
      if (modelsData.models && modelsData.models.length > 0) {
        console.log(chalk.green(`✅ ${modelsData.models.length} modèle(s) trouvé(s)`));
        
        modelChoices = modelsData.models.map(model => ({
          name: `${model.id} ${model.owned_by ? `(${model.owned_by})` : ''}`,
          value: model.id,
          short: model.id
        }));
      } else {
        throw new Error('Aucun modèle trouvé');
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Impossible de récupérer les modèles via l'API: ${error.message}`));
      console.log(chalk.gray('   Utilisation de la liste de modèles par défaut...'));
      
      // Fallback vers la liste statique si l'API échoue
      modelChoices = [
        { name: 'GPT-4o (recommandé)', value: 'gpt-4o', short: 'GPT-4o' },
        { name: 'GPT-4o Mini (plus rapide)', value: 'gpt-4o-mini', short: 'GPT-4o Mini' },
        { name: 'GPT-4 Turbo', value: 'gpt-4-turbo', short: 'GPT-4 Turbo' },
        { name: 'GPT-4', value: 'gpt-4', short: 'GPT-4' },
        { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', short: 'GPT-3.5 Turbo' }
      ];
    }
    
    const modelAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Quel modèle OpenAI voulez-vous utiliser ?',
        choices: modelChoices,
        default: activeConfig.model
      }
    ]);
    
    newModel = modelAnswer.model;
    config.openai.model = newModel;
    
  } else if (activeConfig.provider === PROVIDERS.OPENROUTER) {
    console.log(chalk.blue('\n🌐 Sélection d\'un nouveau modèle OpenRouter'));
    
    newModel = await selectOpenRouterModel();
    config.openrouter.model = newModel;
  } else if (activeConfig.provider === PROVIDERS.OLLAMA) {
    console.log(chalk.magenta('\n🦙 Sélection d\'un nouveau modèle Ollama'));
    
    // Récupérer la liste des modèles installés
    console.log(chalk.blue('🔍 Récupération de la liste des modèles Ollama...'));
    const availableModels = await fetchOllamaModels(activeConfig.baseURL);
    
    let modelChoices = [];
    
    if (availableModels.length > 0) {
      console.log(chalk.green(`✅ ${availableModels.length} modèle(s) trouvé(s)`));
      
      modelChoices = availableModels.map(model => {
        const sizeStr = model.size ? ` (${Math.round(model.size / (1024*1024*1024))}GB)` : '';
        const familyStr = model.family ? ` - ${model.family}` : '';
        return {
          name: `${model.name}${sizeStr}${familyStr}`,
          value: model.name,
          short: model.name
        };
      });
      
      // Ajouter l'option pour un modèle personnalisé
      modelChoices.push({
        name: 'Autre modèle (non installé)...',
        value: 'custom',
        short: 'Personnalisé'
      });
    } else {
      console.log(chalk.yellow('⚠️  Aucun modèle trouvé. Ollama est-il démarré ?'));
      console.log(chalk.gray('   Vous pouvez installer des modèles avec: ollama pull <model>'));
      
      // Proposer des modèles populaires si aucun n'est installé avec option d'installation
      modelChoices = [
        { name: '📥 Installer llama3.2:latest (recommandé, ~2GB)', value: 'install:llama3.2:latest', short: 'Installer Llama 3.2' },
        { name: '📥 Installer llama3.1:latest (~4.7GB)', value: 'install:llama3.1:latest', short: 'Installer Llama 3.1' },
        { name: '📥 Installer mistral:latest (~4.1GB)', value: 'install:mistral:latest', short: 'Installer Mistral' },
        { name: '📥 Installer codellama:latest (~3.8GB)', value: 'install:codellama:latest', short: 'Installer Code Llama' },
        { name: '📥 Installer phi3:latest (~2.3GB)', value: 'install:phi3:latest', short: 'Installer Phi-3' },
        { name: 'Spécifier un autre modèle...', value: 'custom', short: 'Personnalisé' }
      ];
    }
    
    const modelAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Quel modèle Ollama voulez-vous utiliser ?',
        choices: modelChoices,
        default: activeConfig.model
      }
    ]);
    
    // Si l'utilisateur a choisi d'installer un modèle
    if (modelAnswer.model.startsWith('install:')) {
      const modelToInstall = modelAnswer.model.replace('install:', '');
      console.log(chalk.blue(`📥 Installation du modèle ${modelToInstall}...`));
      console.log(chalk.gray('   Cela peut prendre plusieurs minutes selon la taille du modèle...'));
      
      try {
        const { spawn } = await import('child_process');
        const installProcess = spawn('ollama', ['pull', modelToInstall], {
          stdio: 'inherit'
        });
        
        await new Promise((resolve, reject) => {
          installProcess.on('close', (code) => {
            if (code === 0) {
              console.log(chalk.green(`✅ Modèle ${modelToInstall} installé avec succès !`));
              resolve();
            } else {
              reject(new Error(`Installation échouée (code: ${code})`));
            }
          });
          
          installProcess.on('error', (error) => {
            reject(error);
          });
        });
        
        newModel = modelToInstall;
      } catch (error) {
        console.log(chalk.red(`❌ Erreur lors de l'installation: ${error.message}`));
        console.log(chalk.gray('   Vous pouvez installer le modèle manuellement avec: ollama pull ' + modelToInstall));
        newModel = modelToInstall; // Utiliser le modèle même si l'installation a échoué
      }
    }
    else if (modelAnswer.model === 'custom') {
      const customModelAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'customModel',
          message: 'Entrez le nom du modèle Ollama (ex: llama3.2:7b):',
          validate: (input) => {
            if (!input.trim()) {
              return 'Le nom du modèle est requis';
            }
            return true;
          }
        }
      ]);
      newModel = customModelAnswer.customModel.trim();
    } else {
      newModel = modelAnswer.model;
    }
    
    config.ollama.model = newModel;
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
    } else if (provider === PROVIDERS.OPENROUTER) {
      providerConfig = await configureOpenRouter();
    } else if (provider === PROVIDERS.OLLAMA) {
      providerConfig = await configureOllama();
    }
    
    // Charger la configuration existante
    const config = loadConfig();
    
    // Mettre à jour la configuration
    config.provider = provider;
    if (provider === PROVIDERS.OPENAI) {
      config.openai = providerConfig;
    } else if (provider === PROVIDERS.OPENROUTER) {
      config.openrouter = providerConfig;
    } else if (provider === PROVIDERS.OLLAMA) {
      config.ollama = providerConfig;
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
  const needsConfiguration = newProvider === PROVIDERS.OLLAMA ? 
    !providerConfig.model : // Pour Ollama, vérifier le modèle
    !providerConfig.apiKey; // Pour les autres, vérifier la clé API
  
  if (needsConfiguration) {
    console.log(chalk.yellow(`⚠️  Le provider ${newProvider} n'est pas encore configuré`));
    
    if (newProvider === PROVIDERS.OPENAI) {
      config.openai = await configureOpenAI();
    } else if (newProvider === PROVIDERS.OPENROUTER) {
      config.openrouter = await configureOpenRouter();
    } else if (newProvider === PROVIDERS.OLLAMA) {
      config.ollama = await configureOllama();
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