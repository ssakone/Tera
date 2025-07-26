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
    
    // Retourner le cache s'il existe, même expiré
    if (modelsCache.data) {
      console.log(chalk.gray('Utilisation du cache expiré...'));
      return modelsCache.data;
    }
    
    // Si aucun cache disponible, on lève l'erreur
    throw new Error(`Impossible de récupérer les modèles OpenRouter: ${error.message}`);
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
    
    console.log(chalk.blue('🔍 Sélection du modèle OpenRouter'));
    console.log(chalk.gray('Choisissez un mode de sélection:\n'));
    
    // Demander le mode de sélection
    const modeChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Comment voulez-vous sélectionner votre modèle ?',
        choices: [
          {
            name: `${chalk.green('🔍 Recherche interactive')} ${chalk.gray('- Tapez pour rechercher')}`,
            value: 'search',
            short: 'Recherche'
          },
          {
            name: `${chalk.blue('📋 Liste par catégories')} ${chalk.gray('- Naviguer dans toute la liste')}`,
            value: 'browse',
            short: 'Navigation'
          },
          {
            name: `${chalk.cyan('✏️  Saisie manuelle')} ${chalk.gray('- Entrer l\'ID directement')}`,
            value: 'manual',
            short: 'Manuel'
          }
        ]
      }
    ]);

    let selectedModelId;

    if (modeChoice.mode === 'search') {
      // Mode recherche interactive
      selectedModelId = await searchInteractiveModel(allModels);
    } else if (modeChoice.mode === 'browse') {
      // Mode navigation par catégories
      selectedModelId = await browseModelsByCategory(allModels);
    } else {
      // Mode saisie manuelle
      selectedModelId = await manualModelInput();
    }

    const selectedModel = allModels.find(m => m.id === selectedModelId);
    
    if (selectedModel) {
      console.log(chalk.green(`\n✅ Modèle sélectionné: ${chalk.cyan(selectedModel.name)}`));
      console.log(chalk.gray(`   ID: ${selectedModel.id}`));
      
      if (selectedModel.description) {
        console.log(chalk.gray(`   Description: ${selectedModel.description.substring(0, 100)}...`));
      }
      
      if (selectedModel.context_length) {
        console.log(chalk.gray(`   Contexte: ${selectedModel.context_length.toLocaleString()} tokens`));
      }
      
      if (selectedModel.pricing && selectedModel.pricing.prompt) {
        console.log(chalk.gray(`   Prix: $${selectedModel.pricing.prompt}/1K prompt tokens, $${selectedModel.pricing.completion}/1K completion tokens`));
      }
    } else {
      console.log(chalk.green(`\n✅ Modèle sélectionné: ${chalk.cyan(selectedModelId)}`));
    }
    
    console.log('');
    
    return selectedModelId;
  } catch (error) {
    console.error(chalk.red(`❌ Erreur lors de la sélection du modèle: ${error.message}`));
    
    // Fallback: demander l'ID du modèle directement
    return await manualModelInput();
  }
}

/**
 * Recherche interactive avec autocomplétion
 */
async function searchInteractiveModel(allModels) {
  console.log(chalk.blue('\n🔍 Recherche de modèles'));
  console.log(chalk.gray('Tapez des mots-clés pour filtrer les modèles (ex: "gpt", "claude", "code", etc.)\n'));

  const fuse = createFuseSearch(allModels);

  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'search',
      message: 'Rechercher un modèle:',
      validate: (input) => {
        if (!input.trim()) {
          return 'Entrez au moins un mot-clé pour rechercher';
        }
        return true;
      }
    }
  ]);

  // Effectuer la recherche
  const searchResults = fuse.search(answer.search);
  
  if (searchResults.length === 0) {
    console.log(chalk.yellow('❌ Aucun modèle trouvé pour cette recherche'));
    return await manualModelInput();
  }

  console.log(chalk.green(`\n✅ ${searchResults.length} modèle(s) trouvé(s):`));

  // Afficher les résultats et permettre la sélection
  const choices = searchResults.slice(0, 20).map(result => {
    const model = result.item;
    const score = (1 - result.score) * 100;
    return {
      name: `${chalk.cyan(model.name)} ${chalk.gray(`(${model.id}) - ${score.toFixed(0)}% match`)}`,
      value: model.id,
      short: model.name
    };
  });

  if (searchResults.length > 20) {
    choices.push(new inquirer.Separator(chalk.gray(`... et ${searchResults.length - 20} autres résultats`)));
  }

  const selection = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Sélectionnez un modèle:',
      choices: choices,
      pageSize: 15
    }
  ]);

  return selection.model;
}

/**
 * Navigation par catégories (mode original)
 */
async function browseModelsByCategory(allModels) {
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
  
  return answer.model;
}

/**
 * Saisie manuelle de l'ID du modèle
 */
async function manualModelInput() {
  console.log(chalk.cyan('\n✏️  Saisie manuelle'));
  console.log(chalk.gray('Entrez directement l\'ID du modèle OpenRouter (ex: openai/gpt-4o)\n'));

  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'model',
      message: 'ID du modèle OpenRouter:',
      default: 'openai/gpt-4o',
      validate: (input) => {
        if (!input.trim()) {
          return 'L\'ID du modèle est requis';
        }
        if (!input.includes('/')) {
          return 'L\'ID doit être au format "provider/model" (ex: openai/gpt-4o)';
        }
        return true;
      }
    }
  ]);
  
  return answer.model;
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