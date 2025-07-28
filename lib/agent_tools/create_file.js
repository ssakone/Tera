import chalk from 'chalk';
import path from 'path';
import { writeFile } from '../utils/file.js';

/**
 * Crée un fichier avec du contenu optionnel
 * @param {Object} params - Paramètres
 * @param {string} params.path - Chemin vers le fichier à créer (requis)
 * @param {string} [params.content=''] - Contenu du fichier (optionnel, fichier vide par défaut)
 * @returns {string} Message de confirmation
 */
export async function createFile(params) {
  // Validation des paramètres requis
  if (!params.path) {
    throw new Error('Paramètre manquant: path requis');
  }
  
  // Le contenu est optionnel, fichier vide par défaut
  const content = params.content || '';
  
  // Convertir en chemin absolu
  const absolutePath = path.resolve(params.path);
  console.log(chalk.gray(`   📝 Création fichier: ${absolutePath}`));
  console.log(chalk.gray(`   🔄 Chemin résolu: ${params.path} → ${absolutePath}`));
  
  if (content) {
    console.log(chalk.gray(`   📄 Contenu: ${content.length} caractères`));
  } else {
    console.log(chalk.gray(`   📄 Fichier vide (content non fourni)`));
  }
  
  // Créer le fichier
  writeFile(absolutePath, content);
  
  return `✅ Fichier créé: ${absolutePath}`;
} 