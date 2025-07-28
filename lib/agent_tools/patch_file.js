import chalk from 'chalk';
import path from 'path';
import { readFile as utilReadFile, writeFile, fileExists } from '../utils/file.js';

/**
 * Normalise une chaîne pour la comparaison (gestion des espaces)
 * @param {string} str - Chaîne à normaliser
 * @param {boolean} strict - Mode strict (true) ou flexible (false)
 * @returns {string} Chaîne normalisée
 */
function normalizeForComparison(str, strict = true) {
  if (strict) {
    return str;
  }
  // Mode flexible : supprime les espaces de début/fin et normalise les espaces multiples
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Vérifie si deux chaînes correspondent selon différents critères
 * @param {string} target - Chaîne cible (dans le fichier)
 * @param {string} pattern - Motif recherché
 * @returns {Object} Résultat avec match et méthode utilisée
 */
function findBestMatch(target, pattern) {
  // 1. Correspondance exacte
  if (target === pattern) {
    return { match: true, method: 'exacte', confidence: 100 };
  }
  
  // 2. Correspondance en incluant le pattern
  if (target.includes(pattern)) {
    return { match: true, method: 'inclusion', confidence: 90 };
  }
  
  // 3. Correspondance après trim des deux côtés
  if (target.trim() === pattern.trim()) {
    return { match: true, method: 'trim', confidence: 85 };
  }
  
  // 4. Correspondance avec normalisation des espaces
  const normalizedTarget = normalizeForComparison(target, false);
  const normalizedPattern = normalizeForComparison(pattern, false);
  if (normalizedTarget === normalizedPattern) {
    return { match: true, method: 'espaces_normalisés', confidence: 80 };
  }
  
  // 5. Pattern vide et ligne ne contenant que des espaces
  if (pattern.trim() === '' && target.trim() === '') {
    return { match: true, method: 'lignes_vides_équivalentes', confidence: 75 };
  }
  
  // 6. Inclusion après normalisation
  if (normalizedTarget.includes(normalizedPattern) && normalizedPattern.length > 0) {
    return { match: true, method: 'inclusion_normalisée', confidence: 70 };
  }
  
  return { match: false, method: 'aucune', confidence: 0 };
}

/**
 * Applique un remplacement intelligent avec gestion des espaces
 * @param {string} line - Ligne originale
 * @param {string} oldText - Texte à remplacer
 * @param {string} newText - Nouveau texte
 * @returns {Object} Résultat avec la nouvelle ligne et des infos
 */
function smartReplace(line, oldText, newText) {
  const matchResult = findBestMatch(line, oldText);
  
  if (!matchResult.match) {
    return {
      success: false,
      newLine: line,
      message: `Aucune correspondance trouvée pour "${oldText}" dans "${line}"`
    };
  }
  
  let newLine;
  let message;
  
  switch (matchResult.method) {
    case 'exacte':
      newLine = line.replace(oldText, newText);
      message = `Remplacement exact: "${oldText}" → "${newText}"`;
      break;
      
    case 'inclusion':
      newLine = line.replace(oldText, newText);
      message = `Remplacement par inclusion: "${oldText}" → "${newText}"`;
      break;
      
    case 'trim':
      // Préserver l'indentation originale si possible
      const leadingSpaces = line.match(/^(\s*)/)[1];
      const trailingSpaces = line.match(/(\s*)$/)[1];
      newLine = leadingSpaces + newText + trailingSpaces;
      message = `Remplacement avec préservation des espaces: trim("${oldText}") → "${newText}"`;
      break;
      
    case 'espaces_normalisés':
      // Essayer de préserver la structure d'indentation
      const originalIndent = line.match(/^(\s*)/)[1];
      newLine = originalIndent + newText;
      message = `Remplacement avec normalisation des espaces: "${oldText}" → "${newText}"`;
      break;
      
    case 'lignes_vides_équivalentes':
      // Remplacer une ligne vide/espaces par le nouveau contenu
      const currentIndent = line.match(/^(\s*)/)[1];
      newLine = currentIndent + newText;
      message = `Remplacement ligne vide équivalente: "${oldText}" → "${newText}"`;
      break;
      
    case 'inclusion_normalisée':
      // Plus complexe, essayer de remplacer intelligemment
      const normalizedOld = normalizeForComparison(oldText, false);
      const normalizedLine = normalizeForComparison(line, false);
      newLine = line.replace(oldText, newText); // Fallback simple
      message = `Remplacement par inclusion normalisée: "${oldText}" → "${newText}"`;
      break;
      
    default:
      newLine = line;
      message = `Méthode de remplacement inconnue: ${matchResult.method}`;
  }
  
  return {
    success: true,
    newLine,
    message,
    method: matchResult.method,
    confidence: matchResult.confidence
  };
}

/**
 * Applique un patch sur un fichier avec diagnostics détaillés
 * @param {Object} params - Paramètres
 * @param {string} params.path - Chemin vers le fichier
 * @param {Array} params.changes - Liste des changements à appliquer
 * @returns {string} Résultat de l'opération
 */
export async function patchFileWithDiagnostics(params) {
  // Validation des paramètres requis
  if (!params.path || !params.changes) {
    throw new Error('Paramètres manquants: path et changes requis');
  }
  
  const absolutePath = path.resolve(params.path);
  console.log(chalk.blue(`🔧 Patch fichier: ${absolutePath}`));
  console.log(chalk.gray(`   🔄 Chemin résolu: ${params.path} → ${absolutePath}`));
  
  // Validation du fichier
  if (!fileExists(absolutePath)) {
    throw new Error(`Fichier non trouvé: ${absolutePath}`);
  }
  
  // Lire le fichier original
  const originalContent = utilReadFile(absolutePath);
  const originalLines = originalContent.split('\n');
  console.log(chalk.gray(`   📄 Fichier original: ${originalLines.length} ligne(s)`));
  
  // Afficher les changements demandés
  console.log(chalk.gray(`   🔧 ${params.changes.length} changement(s) à appliquer:`));
  params.changes.forEach((change, index) => {
    console.log(chalk.gray(`      ${index + 1}. ${change.action} ligne ${change.line || 'N/A'}: "${change.old}" → "${change.new}"`));
  });
  
  let lines = [...originalLines];
  let changesApplied = 0;
  let detailedResults = [];
  
  // Trier les changements par ligne (en ordre décroissant pour éviter les décalages)
  const sortedChanges = [...params.changes].sort((a, b) => (b.line || 0) - (a.line || 0));
  
  for (const change of sortedChanges) {
    let applied = false;
    let resultMessage = '';
    
    switch (change.action) {
      case 'add':
        if (change.line > 0 && change.line <= lines.length + 1) {
          lines.splice(change.line - 1, 0, change.content);
          applied = true;
          resultMessage = `✅ Ligne ajoutée à la position ${change.line}`;
        } else {
          lines.push(change.content);
          applied = true;
          resultMessage = `✅ Ligne ajoutée à la fin du fichier`;
        }
        break;
        
      case 'replace':
        if (change.line && change.line > 0 && change.line <= lines.length) {
          if (change.old !== undefined && change.new !== undefined) {
            const oldLine = lines[change.line - 1];
            const replaceResult = smartReplace(oldLine, change.old, change.new);
            
            if (replaceResult.success) {
              lines[change.line - 1] = replaceResult.newLine;
              applied = true;
              resultMessage = `✅ Ligne ${change.line}: ${replaceResult.message} (méthode: ${replaceResult.method}, confiance: ${replaceResult.confidence}%)`;
            } else {
              resultMessage = `❌ Ligne ${change.line}: ${replaceResult.message}`;
              // Diagnostic amélioré
              console.log(chalk.yellow(`   🔍 Diagnostic ligne ${change.line}:`));
              console.log(chalk.yellow(`      Contenu réel: "${oldLine}"`));
              console.log(chalk.yellow(`      Recherché: "${change.old}"`));
              console.log(chalk.yellow(`      Longueur réelle: ${oldLine.length}, recherchée: ${change.old.length}`));
              console.log(chalk.yellow(`      Espaces début réel: "${oldLine.match(/^(\s*)/)[1]}" (${oldLine.match(/^(\s*)/)[1].length} chars)`));
              console.log(chalk.yellow(`      Espaces début recherché: "${change.old.match(/^(\s*)/)?.[1] || ''}" (${(change.old.match(/^(\s*)/)?.[1] || '').length} chars)`));
            }
          } else if (change.content !== undefined) {
            lines[change.line - 1] = change.content;
            applied = true;
            resultMessage = `✅ Ligne ${change.line} remplacée entièrement`;
          }
        } else {
          resultMessage = `❌ Ligne ${change.line} invalide (fichier a ${lines.length} lignes)`;
        }
        break;
        
      case 'insert_after':
        if (change.line && change.line > 0 && change.line <= lines.length) {
          lines.splice(change.line, 0, change.content);
          applied = true;
          resultMessage = `✅ Ligne insérée après la ligne ${change.line}`;
        } else {
          resultMessage = `❌ Position d'insertion invalide: ligne ${change.line}`;
        }
        break;
        
      default:
        resultMessage = `❌ Action inconnue: ${change.action}`;
    }
    
    if (applied) {
      changesApplied++;
    }
    
    detailedResults.push({ change, applied, message: resultMessage });
    console.log(chalk.gray(`      ${resultMessage}`));
  }
  
  // Vérifier s'il y a eu des changements effectifs
  if (changesApplied === 0) {
    console.log(chalk.red(`   ❌ Aucun changement appliqué ! Vérifiez les instructions de patch.`));
    
    // Diagnostic général amélioré
    console.log(chalk.yellow(`\n   🔍 Diagnostic général:`));
    console.log(chalk.yellow(`      📄 Fichier: ${originalLines.length} ligne(s)`));
    params.changes.forEach((change, index) => {
      if (change.line && change.line <= originalLines.length) {
        const actualLine = originalLines[change.line - 1];
        console.log(chalk.yellow(`      ${index + 1}. Ligne ${change.line}:`));
        console.log(chalk.yellow(`         Contenu réel: "${actualLine}"`));
        console.log(chalk.yellow(`         Recherché: "${change.old}"`));
        
        // Suggérer des corrections
        const matchResult = findBestMatch(actualLine, change.old || '');
        if (matchResult.confidence > 0) {
          console.log(chalk.cyan(`         💡 Suggestion: Utilisez la méthode "${matchResult.method}" (confiance: ${matchResult.confidence}%)`));
        }
      }
    });
    
    // Retourner un résultat d'échec avec les indicateurs que l'IA doit voir
    const failureResult = `❌ Aucun changement appliqué ! Vérifiez les instructions de patch.
📊 0/${params.changes.length} changement(s) appliqué(s)
🔧 Patch échoué sur: ${absolutePath}

Détails des échecs:
${detailedResults.map(r => `- ${r.message}`).join('\n')}

💡 Suggestions:
- Vérifiez les espaces de début/fin de ligne
- Utilisez read_file_lines pour voir le contenu exact avant de faire un patch
- Considérez utiliser une ligne complète au lieu d'un fragment`;
    
    throw new Error(failureResult);
  }
  
  // Écrire le fichier modifié
  const newContent = lines.join('\n');
  const backup = `${absolutePath}.backup-${Date.now()}`;
  
  try {
    // Créer une sauvegarde
    writeFile(backup, originalContent);
    console.log(chalk.gray(`   💾 Sauvegarde créée: ${backup}`));
    
    // Écrire le nouveau contenu
    writeFile(absolutePath, newContent);
    console.log(chalk.green(`   ✅ Fichier modifié avec succès`));
    console.log(chalk.gray(`   📊 ${changesApplied}/${params.changes.length} changement(s) appliqué(s)`));
    console.log(chalk.gray(`   📏 ${originalLines.length} → ${lines.length} ligne(s)`));
    
    // Retourner un résultat détaillé avec tous les indicateurs que l'IA doit voir
    return `✅ Fichier modifié avec succès
📊 ${changesApplied}/${params.changes.length} changement(s) appliqué(s)
💾 Sauvegarde créée: ${backup}
📏 ${originalLines.length} → ${lines.length} ligne(s)
🔧 Patch appliqué sur: ${absolutePath}`;
    
  } catch (error) {
    console.log(chalk.red(`   ❌ Erreur lors de l'écriture: ${error.message}`));
    throw new Error(`Impossible d'écrire le fichier: ${error.message}`);
  }
} 