import chalk from 'chalk';
import inquirer from 'inquirer';
import Fuse from 'fuse.js';

/**
 * Cache pour les modèles OpenRouter
 */
let modelsCache = {
  data: null,
  timestamp: 0,
  duration: 5 * 60 * 1000 // 5 minutes en millisecondes
};

/**
 * Liste des modèles OpenRouter statiques de fallback
 */
const FALLBACK_OPENROUTER_MODELS = {
  'GPT Models': [
    { name: 'GPT-4o', id: 'openai/gpt-4o', description: 'Le plus récent modèle GPT-4 d\'OpenAI' },
    { name: 'GPT-4o Mini', id: 'openai/gpt-4o-mini', description: 'Version plus rapide et moins chère de GPT-4o' },
    { name: 'GPT-4 Turbo', id: 'openai/gpt-4-turbo', description: 'GPT-4 avec une fenêtre de contexte étendue' },
    { name: 'GPT-4', id: 'openai/gpt-4', description: 'Modèle GPT-4 standard' },
    { name: 'GPT-3.5 Turbo', id: 'openai/gpt-3.5-turbo', description: 'Rapide et efficace pour la plupart des tâches' },
  ],
  'Claude Models': [
    { name: 'Claude 3.5 Sonnet', id: 'anthropic/claude-3.5-sonnet', description: 'Le plus avancé des modèles Claude' },
    { name: 'Claude 3 Opus', id: 'anthropic/claude-3-opus', description: 'Le plus puissant modèle Claude 3' },
    { name: 'Claude 3 Sonnet', id: 'anthropic/claude-3-sonnet', description: 'Équilibre entre performance et vitesse' },
    { name: 'Claude 3 Haiku', id: 'anthropic/claude-3-haiku', description: 'Le plus rapide des modèles Claude 3' },
  ],
  'Popular Models': [
    { name: 'Llama 3.1 405B', id: 'meta-llama/llama-3.1-405b-instruct', description: 'Le plus grand modèle Llama 3.1' },
    { name: 'Gemini Pro 1.5', id: 'google/gemini-pro-1.5', description: 'Modèle Gemini avec fenêtre de contexte étendue' },
    { name: 'DeepSeek Coder V2', id: 'deepseek/deepseek-coder', description: 'Modèle spécialisé pour la programmation' },
    { name: 'Mixtral 8x7B', id: 'mistralai/mixtral-8x7b-instruct', description: 'Modèle mixture of experts performant' },
  ]
};

/**
 * Récupère les modèles OpenRouter depuis l'API
 */
async function fetchOpenRouterModels() {
  const now = Date.now();
  
  // Retourner le cache s'il est encore valide
  if (modelsCache.data && (now - modelsCache.timestamp) < modelsCache.duration) {
    return modelsCache.data;
  }

  try {
    console.log(chalk.blue('🔄 Récupération des modèles OpenRouter...'));
    
    // Import dynamique de fetch pour Node.js
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000 // 10 secondes de timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Format de réponse invalide de l\'API OpenRouter');
    }

    // Transformer les données pour notre format
    const models = data.data.map(model => ({
      name: model.name || model.id.split('/').pop() || model.id,
      id: model.id,
      description: model.description || '',
      context_length: model.context_length || model.top_provider?.context_length,
      pricing: model.pricing,
      category: categorizeModel(model.id)
    }));

    // Mettre à jour le cache
    modelsCache.data = models;
    modelsCache.timestamp = now;

    console.log(chalk.green(`✅ ${models.length} modèles récupérés depuis OpenRouter`));
    
    return models;
  } catch (error) {
    console.warn(chalk.yellow(`⚠️  Erreur lors de la récupération des modèles OpenRouter: ${error.message}`));
    console.log(chalk.gray('Utilisation des modèles de fallback...'));
    
    // Retourner le cache s'il existe, même expiré
    if (modelsCache.data) {
      return modelsCache.data;
    }
    
    // Sinon, utiliser les modèles de fallback
    return getFallbackModels();
  }
}

/**
 * Catégorise un modèle basé sur son ID
 */
function categorizeModel(modelId) {
  const id = modelId.toLowerCase();
  
  if (id.includes('gpt') || id.includes('openai')) {
    return 'GPT Models';
  } else if (id.includes('claude') || id.includes('anthropic')) {
    return 'Claude Models';
  } else if (id.includes('gemini') || id.includes('google')) {
    return 'Gemini Models';
  } else if (id.includes('llama') || id.includes('meta')) {
    return 'Llama Models';
  } else if (id.includes('mixtral') || id.includes('mistral')) {
    return 'Mistral Models';
  } else if (id.includes('qwen')) {
    return 'Qwen Models';
  } else if (id.includes('deepseek')) {
    return 'DeepSeek Models';
  } else if (id.includes('code') || id.includes('programming')) {
    return 'Coding Models';
  } else {
    return 'Other Models';
  }
}

/**
 * Retourne les modèles de fallback formatés
 */
function getFallbackModels() {
  const models = [];
  
  Object.entries(FALLBACK_OPENROUTER_MODELS).forEach(([category, categoryModels]) => {
    categoryModels.forEach(model => {
      models.push({
        ...model,
        category,
        searchText: `${model.name} ${model.id} ${model.description} ${category}`.toLowerCase()
      });
    });
  });
  
  return models;
}

/**
 * Obtient la liste complète des modèles avec métadonnées
 */
async function getAllModels() {
  const models = await fetchOpenRouterModels();
  
  return models.map(model => ({
    ...model,
    searchText: `${model.name} ${model.id} ${model.description || ''} ${model.category}`.toLowerCase()
  }));
}

/**
 * Configure la recherche floue avec Fuse.js
 */
function createFuseSearch(models) {
  const options = {
    keys: ['name', 'id', 'description', 'category'],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 2
  };
  
  return new Fuse(models, options);
}

/**
 * Affiche les modèles par catégorie
 */
function displayModelsByCategory(models) {
  const modelsByCategory = {};
  
  models.forEach(model => {
    if (!modelsByCategory[model.category]) {
      modelsByCategory[model.category] = [];
    }
    modelsByCategory[model.category].push(model);
  });
  
  console.log(chalk.blue('\n📋 Modèles OpenRouter disponibles:\n'));
  
  // Trier les catégories par popularité
  const sortedCategories = Object.keys(modelsByCategory).sort((a, b) => {
    const priority = {
      'GPT Models': 1,
      'Claude Models': 2,
      'Gemini Models': 3,
      'Llama Models': 4,
      'Coding Models': 5
    };
    
    return (priority[a] || 99) - (priority[b] || 99);
  });
  
  sortedCategories.forEach(category => {
    const categoryModels = modelsByCategory[category];
    console.log(chalk.yellow(`${category} (${categoryModels.length}):`));
    
    // Afficher seulement les 5 premiers modèles par catégorie pour éviter le spam
    const modelsToShow = categoryModels.slice(0, 5);
    modelsToShow.forEach(model => {
      console.log(chalk.gray(`  • ${chalk.white(model.name)} ${chalk.cyan(`(${model.id})`)}`));
      if (model.description && model.description.length > 0) {
        console.log(chalk.gray(`    ${model.description.substring(0, 80)}${model.description.length > 80 ? '...' : ''}`));
      }
    });
    
    if (categoryModels.length > 5) {
      console.log(chalk.gray(`    ... et ${categoryModels.length - 5} autres modèles`));
    }
    console.log('');
  });
  
  console.log(chalk.gray(`Total: ${models.length} modèles disponibles`));
}

/**
 * Interface de sélection interactive de modèles avec recherche
 */
export async function selectOpenRouterModel() {
  try {
    const allModels = await getAllModels();
    const fuse = createFuseSearch(allModels);
    
    console.log(chalk.blue('🔍 Sélection du modèle OpenRouter'));
    console.log(chalk.gray('Tapez pour rechercher un modèle ou naviguez avec les flèches\n'));
    
    // Afficher d'abord tous les modèles disponibles
    displayModelsByCategory(allModels);
    
    // Grouper par catégorie et créer les choix
    const modelsByCategory = {};
    allModels.forEach(model => {
      if (!modelsByCategory[model.category]) {
        modelsByCategory[model.category] = [];
      }
      modelsByCategory[model.category].push(model);
    });

    // Créer les choix avec des séparateurs par catégorie
    const choices = [];
    const sortedCategories = Object.keys(modelsByCategory).sort((a, b) => {
      const priority = {
        'GPT Models': 1,
        'Claude Models': 2,
        'Gemini Models': 3,
        'Llama Models': 4,
        'Coding Models': 5
      };
      return (priority[a] || 99) - (priority[b] || 99);
    });

    sortedCategories.forEach((category, categoryIndex) => {
      if (categoryIndex > 0) {
        choices.push(new inquirer.Separator());
      }
      choices.push(new inquirer.Separator(chalk.yellow(`── ${category} ──`)));
      
      modelsByCategory[category].forEach(model => {
        choices.push({
          name: `${chalk.cyan(model.name)} ${chalk.gray(`(${model.id})`)}`,
          value: model.id,
          short: model.name
        });
      });
    });
    
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'model',
        message: 'Choisissez un modèle:',
        choices: choices,
        pageSize: 15,
        loop: false
      }
    ]);
    
    const selectedModel = allModels.find(m => m.id === answer.model);
    
    console.log(chalk.green(`\n✅ Modèle sélectionné: ${chalk.cyan(selectedModel.name)}`));
    console.log(chalk.gray(`   ID: ${selectedModel.id}`));
    
    if (selectedModel.description) {
      console.log(chalk.gray(`   Description: ${selectedModel.description}`));
    }
    
    if (selectedModel.context_length) {
      console.log(chalk.gray(`   Contexte: ${selectedModel.context_length.toLocaleString()} tokens`));
    }
    
    if (selectedModel.pricing && selectedModel.pricing.prompt) {
      console.log(chalk.gray(`   Prix: $${selectedModel.pricing.prompt}/1K prompt tokens, $${selectedModel.pricing.completion}/1K completion tokens`));
    }
    
    console.log('');
    
    return answer.model;
  } catch (error) {
    console.error(chalk.red(`❌ Erreur lors de la sélection du modèle: ${error.message}`));
    
    // Fallback: demander l'ID du modèle directement
    const fallbackAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'model',
        message: 'Entrez l\'ID du modèle OpenRouter:',
        default: 'openai/gpt-4o',
        validate: (input) => {
          if (!input.trim()) {
            return 'L\'ID du modèle est requis';
          }
          return true;
        }
      }
    ]);
    
    return fallbackAnswer.model;
  }
}

/**
 * Recherche de modèles avec autocomplétion
 */
export async function searchModels(query) {
  const allModels = await getAllModels();
  const fuse = createFuseSearch(allModels);
  
  if (!query || query.length < 2) {
    return allModels.slice(0, 10); // Retourner les 10 premiers modèles par défaut
  }
  
  const results = fuse.search(query);
  return results.map(result => result.item);
}

/**
 * Obtient les informations d'un modèle par son ID
 */
export async function getModelInfo(modelId) {
  const allModels = await getAllModels();
  return allModels.find(model => model.id === modelId);
}

/**
 * Valide qu'un ID de modèle existe
 */
export async function validateModelId(modelId) {
  const allModels = await getAllModels();
  return allModels.some(model => model.id === modelId);
}

/**
 * Obtient les modèles recommandés pour différents cas d'usage
 */
export function getRecommendedModels() {
  return {
    general: 'openai/gpt-4o',
    coding: 'deepseek/deepseek-coder',
    fast: 'openai/gpt-4o-mini',
    powerful: 'anthropic/claude-3.5-sonnet',
    economical: 'meta-llama/llama-3.1-8b-instruct'
  };
}

/**
 * Force le rechargement du cache des modèles
 */
export function refreshModelsCache() {
  modelsCache.data = null;
  modelsCache.timestamp = 0;
} 