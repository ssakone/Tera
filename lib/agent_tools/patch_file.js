import chalk from 'chalk';
import path from 'path';
import { readFile as utilReadFile, writeFile, fileExists } from '../utils/file.js';

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
          if (change.old && change.new) {
            const oldLine = lines[change.line - 1];
            if (oldLine.includes(change.old)) {
              lines[change.line - 1] = oldLine.replace(change.old, change.new);
              applied = true;
              resultMessage = `✅ Ligne ${change.line} modifiée: "${change.old}" → "${change.new}"`;
            } else {
              resultMessage = `❌ Ligne ${change.line}: texte "${change.old}" non trouvé. Contenu réel: "${oldLine}"`;
            }
          } else if (change.content) {
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
    
    // Retourner un résultat d'échec avec les indicateurs que l'IA doit voir
    const failureResult = `❌ Aucun changement appliqué ! Vérifiez les instructions de patch.
📊 0/${params.changes.length} changement(s) appliqué(s)
🔧 Patch échoué sur: ${absolutePath}

Détails des échecs:
${detailedResults.map(r => `- ${r.message}`).join('\n')}`;
    
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