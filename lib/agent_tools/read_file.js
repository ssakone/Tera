import chalk from 'chalk';
import path from 'path';
import { readFile as utilReadFile, fileExists } from '../utils/file.js';

/**
 * Lit un fichier avec numéros de lignes dans une plage spécifiée
 * @param {Object} params - Paramètres
 * @param {string} params.path - Chemin vers le fichier
 * @param {number} params.start_line - Ligne de début (incluse)
 * @param {number} params.end_line - Ligne de fin (incluse)
 * @returns {string} Contenu du fichier avec numéros de lignes
 */
export async function readFileWithLines(params) {
  // Validation des paramètres requis
  if (!params.path) {
    throw new Error('Paramètre manquant: path requis');
  }
  
  if (!params.start_line || !params.end_line) {
    throw new Error('Paramètres manquants: start_line et end_line requis');
  }
  
  // Convertir le chemin en chemin absolu
  const absolutePath = path.resolve(params.path);
  console.log(chalk.gray(`   🔄 Chemin résolu: ${params.path} → ${absolutePath}`));
  
  // Validation du fichier (utiliser le chemin absolu)
  if (!fileExists(absolutePath)) {
    throw new Error(`Fichier non trouvé: ${absolutePath}`);
  }
  
  // Validation des numéros de lignes
  const startLine = parseInt(params.start_line);
  const endLine = parseInt(params.end_line);
  
  if (isNaN(startLine) || isNaN(endLine)) {
    throw new Error('start_line et end_line doivent être des nombres');
  }
  
  if (startLine < 1) {
    throw new Error('start_line doit être >= 1');
  }
  
  if (endLine < startLine) {
    throw new Error('end_line doit être >= start_line');
  }
  
  // Validation du minimum de 50 lignes
  const lineDifference = endLine - startLine + 1;
  if (lineDifference < 50) {
    throw new Error(`Minimum 50 lignes requis. Actuellement: ${lineDifference} lignes (${startLine}-${endLine}). Ajustez la plage pour avoir au moins 50 lignes.`);
  }
  
  console.log(chalk.blue(`📖 Lecture du fichier: ${absolutePath}`));
  console.log(chalk.gray(`   📏 Lignes ${startLine}-${endLine} (${lineDifference} lignes)`));
  
  // Lecture du fichier
  const content = utilReadFile(absolutePath);
  const lines = content.split('\n');
  const totalLines = lines.length;
  
  // Vérification que les lignes demandées existent
  if (startLine > totalLines) {
    throw new Error(`start_line (${startLine}) dépasse le nombre total de lignes (${totalLines})`);
  }
  
  // Ajuster end_line si elle dépasse le fichier
  const actualEndLine = Math.min(endLine, totalLines);
  if (endLine > totalLines) {
    console.log(chalk.yellow(`   ⚠️  end_line ajustée de ${endLine} à ${actualEndLine} (fin du fichier)`));
  }
  
  // Extraire les lignes demandées
  const startIdx = startLine - 1;
  const endIdx = actualEndLine;
  const selectedLines = lines.slice(startIdx, endIdx);
  
  // Afficher avec numéros de lignes
  console.log(chalk.gray(`   📄 Contenu (${selectedLines.length} lignes):`));
  selectedLines.forEach((line, idx) => {
    const lineNum = startIdx + idx + 1;
    console.log(chalk.gray(`   ${lineNum.toString().padStart(4)}: ${line}`));
  });
  
  // Retourner le contenu avec numéros de lignes pour l'IA
  const numberedContent = selectedLines
    .map((line, idx) => {
      const lineNum = startIdx + idx + 1;
      return `${lineNum.toString().padStart(4)}: ${line}`;
    })
    .join('\n');
  
  return numberedContent;
} 