import { fileExists, readFile, writeFile, createDirectory } from './file.js';
import path from 'path';
import { createHash } from 'crypto';

/**
 * Gestionnaire de mémoire persistante pour l'agent IA
 * Basé sur les meilleures pratiques : mémoire épisodique, sémantique et procédurale
 * Références: https://medium.com/@gokcerbelgusen/memory-types-in-agentic-ai-a-breakdown-523c980921ec
 */
export class MemoryManager {
  constructor() {
    this.memoryDir = path.join(process.cwd(), '.tera', 'memory');
    this.episodicFile = path.join(this.memoryDir, 'episodic.json');
    this.semanticFile = path.join(this.memoryDir, 'semantic.json');
    this.proceduralFile = path.join(this.memoryDir, 'procedural.json');
    
    this.ensureMemoryDir();
    this.loadMemories();
  }

  /**
   * Créer le répertoire de mémoire si nécessaire
   */
  ensureMemoryDir() {
    if (!fileExists(this.memoryDir)) {
      createDirectory(this.memoryDir);
    }
  }

  /**
   * Charger toutes les mémoires depuis le disque
   */
  loadMemories() {
    this.episodicMemory = this.loadMemoryFile(this.episodicFile) || [];
    this.semanticMemory = this.loadMemoryFile(this.semanticFile) || {};
    this.proceduralMemory = this.loadMemoryFile(this.proceduralFile) || {};
  }

  /**
   * Charger un fichier de mémoire spécifique
   */
  loadMemoryFile(filePath) {
    try {
      if (fileExists(filePath)) {
        return JSON.parse(readFile(filePath));
      }
    } catch (error) {
      console.warn(`Erreur lors du chargement de la mémoire: ${error.message}`);
    }
    return null;
  }

  /**
   * Sauvegarder toutes les mémoires
   */
  saveMemories() {
    try {
      writeFile(this.episodicFile, JSON.stringify(this.episodicMemory, null, 2));
      writeFile(this.semanticFile, JSON.stringify(this.semanticMemory, null, 2));
      writeFile(this.proceduralFile, JSON.stringify(this.proceduralMemory, null, 2));
    } catch (error) {
      console.warn(`Erreur lors de la sauvegarde de la mémoire: ${error.message}`);
    }
  }

  // ==================== MÉMOIRE ÉPISODIQUE ====================
  /**
   * Ajouter une expérience/interaction à la mémoire épisodique
   * Stocke les événements spécifiques avec contexte temporel
   */
  addEpisode(task, actionsOrContext, results = null, context = {}) {
    // Si appelé avec seulement 2 paramètres, le second est le contexte
    if (results === null && typeof actionsOrContext === 'object' && !Array.isArray(actionsOrContext)) {
      context = actionsOrContext;
      actionsOrContext = [];
      results = [];
    }
    
    const episode = {
      id: this.generateId(task),
      timestamp: new Date().toISOString(),
      task,
      actions: actionsOrContext || [],
      results: results || [],
      context,
      success: Array.isArray(results) && results.length > 0 ? results.every(r => r.success) : true,
      errors: Array.isArray(results) ? results.filter(r => !r.success).map(r => r.error) : []
    };

    this.episodicMemory.unshift(episode); // Ajouter au début (plus récent)
    
    // Garder seulement les 100 épisodes les plus récents
    if (this.episodicMemory.length > 100) {
      this.episodicMemory = this.episodicMemory.slice(0, 100);
    }

    this.saveMemories();
    return episode;
  }

  /**
   * Récupérer les épisodes similaires pour apprentissage
   */
  getSimilarEpisodes(task, limit = 5) {
    const keywords = this.extractKeywords(task);
    
    return this.episodicMemory
      .filter(episode => {
        const episodeKeywords = this.extractKeywords(episode.task);
        return keywords.some(keyword => episodeKeywords.includes(keyword));
      })
      .slice(0, limit);
  }

  /**
   * Récupérer les erreurs récurrentes
   */
  getRecurringErrors(task) {
    const similar = this.getSimilarEpisodes(task, 10);
    const errors = similar.flatMap(ep => ep.errors || []);
    
    // Compter les occurrences d'erreurs
    const errorCounts = {};
    errors.forEach(error => {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });

    // Retourner les erreurs qui se répètent (≥2 fois)
    return Object.entries(errorCounts)
      .filter(([error, count]) => count >= 2)
      .map(([error, count]) => ({ error, count }));
  }

  // ==================== MÉMOIRE SÉMANTIQUE ====================
  /**
   * Ajouter des connaissances factuelles à la mémoire sémantique
   */
  addKnowledge(category, key, value) {
    if (!this.semanticMemory[category]) {
      this.semanticMemory[category] = {};
    }
    
    this.semanticMemory[category][key] = {
      value,
      timestamp: new Date().toISOString(),
      usage_count: 0
    };

    this.saveMemories();
  }

  /**
   * Récupérer des connaissances
   */
  getKnowledge(category, key) {
    if (this.semanticMemory[category] && this.semanticMemory[category][key]) {
      const knowledge = this.semanticMemory[category][key];
      knowledge.usage_count++;
      this.saveMemories();
      return knowledge.value;
    }
    return null;
  }

  /**
   * Ajouter des patterns d'erreurs communes
   */
  addErrorPattern(errorType, solution) {
    this.addKnowledge('error_patterns', errorType, solution);
  }

  /**
   * Récupérer la solution pour un type d'erreur
   */
  getErrorSolution(errorType) {
    return this.getKnowledge('error_patterns', errorType);
  }

  // ==================== MÉMOIRE PROCÉDURALE ====================
  /**
   * Ajouter un workflow efficace à la mémoire procédurale
   */
  addWorkflow(name, steps, successRate = 1.0) {
    this.proceduralMemory[name] = {
      steps,
      successRate,
      usage_count: 0,
      last_used: new Date().toISOString()
    };

    this.saveMemories();
  }

  /**
   * Récupérer un workflow optimisé
   */
  getWorkflow(name) {
    if (this.proceduralMemory[name]) {
      const workflow = this.proceduralMemory[name];
      workflow.usage_count++;
      workflow.last_used = new Date().toISOString();
      this.saveMemories();
      return workflow;
    }
    return null;
  }

  /**
   * Mettre à jour le taux de succès d'un workflow
   */
  updateWorkflowSuccess(name, success) {
    if (this.proceduralMemory[name]) {
      const workflow = this.proceduralMemory[name];
      const currentRate = workflow.successRate;
      const usageCount = workflow.usage_count;
      
      // Moyenne pondérée pour mettre à jour le taux de succès
      workflow.successRate = (currentRate * usageCount + (success ? 1 : 0)) / (usageCount + 1);
      this.saveMemories();
    }
  }

  // ==================== MÉTHODES UTILITAIRES ====================
  /**
   * Générer un ID unique pour un épisode
   */
  generateId(content) {
    return createHash('md5').update(content + Date.now()).digest('hex').substring(0, 8);
  }

  /**
   * Extraire les mots-clés d'une tâche
   */
  extractKeywords(text) {
    const stopWords = ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'de', 'du', 'dans', 'pour', 'avec'];
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .filter(word => /^[a-zA-Z0-9._-]+$/.test(word)); // Garder les noms de fichiers
  }

  /**
   * Obtenir un contexte de mémoire pour une tâche
   */
  getContextForTask(task) {
    const similarEpisodes = this.getSimilarEpisodes(task, 3);
    const recurringErrors = this.getRecurringErrors(task);
    
    // Patterns d'erreurs communes
    const keywords = this.extractKeywords(task);
    const relevantPatterns = {};
    keywords.forEach(keyword => {
      const solution = this.getErrorSolution(keyword);
      if (solution) {
        relevantPatterns[keyword] = solution;
      }
    });

    return {
      similarEpisodes,
      recurringErrors,
      relevantPatterns,
      hasContext: similarEpisodes.length > 0 || recurringErrors.length > 0 || Object.keys(relevantPatterns).length > 0
    };
  }

  /**
   * Réinitialiser complètement la mémoire (pour debug)
   */
  clearMemory() {
    this.episodicMemory = [];
    this.semanticMemory = {};
    this.proceduralMemory = {};
    this.saveMemories();
  }

  /**
   * Obtenir des statistiques de mémoire
   */
  getMemoryStats() {
    return {
      episodes: this.episodicMemory.length,
      semanticCategories: Object.keys(this.semanticMemory).length,
      procedures: Object.keys(this.proceduralMemory).length,
      memorySize: JSON.stringify({
        episodic: this.episodicMemory,
        semantic: this.semanticMemory,
        procedural: this.proceduralMemory
      }).length
    };
  }
}

// Instance globale
let memoryInstance = null;

/**
 * Obtenir l'instance singleton de la mémoire
 */
export function getMemoryManager() {
  if (!memoryInstance) {
    memoryInstance = new MemoryManager();
  }
  return memoryInstance;
}

/**
 * Initialiser la mémoire avec des patterns d'erreurs communes
 */
export function initializeDefaultMemory() {
  const memory = getMemoryManager();
  
  // Patterns d'erreurs Python communes
  // memory.addErrorPattern('IndentationError', {
  //   solution: 'Ajouter 4 espaces au début de la ligne problématique',
  //   example: 'Changer "def method():" en "    def method():" ou ajouter "    pass"',
  //   common_causes: ['Classe vide', 'Fonction vide', 'Bloc if/for/while vide']
  // });

  // memory.addErrorPattern('SyntaxError', {
  //   solution: 'Vérifier les parenthèses, guillemets et deux-points',
  //   example: 'Ajouter ":" après "if condition" ou fermer les parenthèses',
  //   common_causes: ['Parenthèses non fermées', 'Deux-points manquants', 'Guillemets non fermés']
  // });

  // // Patterns JavaScript/TypeScript
  // memory.addErrorPattern('ReferenceError', {
  //   solution: 'Déclarer la variable avant utilisation',
  //   example: 'Ajouter "const myVar = ..." avant de l\'utiliser',
  //   common_causes: ['Variable non déclarée', 'Erreur de portée', 'Import manquant']
  // });

  // Workflows efficaces
  // memory.addWorkflow('fix_indentation_error', [
  //   'analyze_file pour voir le contenu',
  //   'identifier la ligne après la définition de classe/fonction',
  //   'patch_file avec indentation correcte (4 espaces)',
  //   'run_command pour tester'
  // ], 0.9);

  // memory.addWorkflow('debug_syntax_error', [
  //   'analyze_file pour localiser l\'erreur',
  //   'identifier le type d\'erreur syntaxique',
  //   'patch_file avec correction spécifique',
  //   'run_command pour valider'
  // ], 0.85);
} 