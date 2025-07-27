import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Vérifie si un fichier existe
 */
export function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * Lit le contenu d'un fichier
 */
export function readFile(filePath) {
  try {
    if (!fileExists(filePath)) {
      const absolutePath = path.resolve(filePath);
      throw new Error(`Le fichier "${filePath}" n'existe pas (chemin absolu: ${absolutePath})`);
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    return content;
  } catch (error) {
    throw new Error(`Erreur lors de la lecture du fichier "${filePath}": ${error.message}`);
  }
}

/**
 * Écrit du contenu dans un fichier
 */
export function writeFile(filePath, content) {
  try {
    // Créer le dossier parent s'il n'existe pas
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    const absolutePath = path.resolve(filePath);
    throw new Error(`Erreur lors de l'écriture du fichier "${filePath}" (chemin absolu: ${absolutePath}): ${error.message}`);
  }
}

/**
 * Récupère des informations sur un fichier
 */
export function getFileInfo(filePath) {
  try {
    if (!fileExists(filePath)) {
      return null;
    }
    
    const stats = fs.statSync(filePath);
    const extension = path.extname(filePath);
    const basename = path.basename(filePath);
    const dirname = path.dirname(filePath);
    
    return {
      path: filePath,
      basename,
      dirname,
      extension,
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modified: stats.mtime
    };
  } catch (error) {
    throw new Error(`Erreur lors de la récupération des informations du fichier "${filePath}": ${error.message}`);
  }
}

/**
 * Crée un dossier avec tous ses parents si nécessaire
 */
export function createDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    throw new Error(`Erreur lors de la création du dossier "${dirPath}": ${error.message}`);
  }
}

/**
 * Crée une sauvegarde d'un fichier
 */
export function createBackup(filePath) {
  try {
    if (!fileExists(filePath)) {
      throw new Error(`Le fichier "${filePath}" n'existe pas`);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    
    const content = readFile(filePath);
    writeFile(backupPath, content);
    
    return backupPath;
  } catch (error) {
    throw new Error(`Erreur lors de la création de la sauvegarde: ${error.message}`);
  }
}

/**
 * Applique un patch sur un fichier
 */
export function applyPatch(filePath, changes) {
  try {
    if (!fileExists(filePath)) {
      throw new Error(`Fichier non trouvé: ${filePath}`);
    }

    const content = readFile(filePath);
    const lines = content.split('\n');
    let changesApplied = 0;
    
    // Trier les changements par ligne (en ordre décroissant pour éviter les décalages)
    const sortedChanges = [...changes].sort((a, b) => (b.line || 0) - (a.line || 0));
    
    for (const change of sortedChanges) {
      let applied = false;
      
      switch (change.action) {
        case 'add':
          // Ajouter une ligne à la position spécifiée
          if (change.line > 0 && change.line <= lines.length + 1) {
            lines.splice(change.line - 1, 0, change.content);
            applied = true;
          } else {
            lines.push(change.content);
            applied = true;
          }
          break;
          
        case 'replace':
          // Remplacer une ligne ou du contenu spécifique
          if (change.line && change.line > 0 && change.line <= lines.length) {
            if (change.old && change.new) {
              // Remplacer du contenu spécifique dans la ligne
              const oldLine = lines[change.line - 1];
              lines[change.line - 1] = oldLine.replace(change.old, change.new);
              applied = oldLine !== lines[change.line - 1];
            } else if (change.content) {
              // Remplacer toute la ligne
              lines[change.line - 1] = change.content;
              applied = true;
            }
          } else if (change.old && change.new) {
            // Recherche et remplacement global
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(change.old)) {
                const oldLine = lines[i];
                lines[i] = lines[i].replace(change.old, change.new);
                applied = oldLine !== lines[i];
                break; // Remplacer seulement la première occurrence
              }
            }
          }
          break;
          
        case 'delete':
          // Supprimer une ligne
          if (change.line && change.line > 0 && change.line <= lines.length) {
            lines.splice(change.line - 1, 1);
            applied = true;
          }
          break;
          
        case 'insert_after':
          // Insérer après une ligne spécifique
          if (change.line && change.line > 0 && change.line <= lines.length) {
            lines.splice(change.line, 0, change.content);
            applied = true;
          }
          break;
          
        case 'insert_before':
          // Insérer avant une ligne spécifique
          if (change.line && change.line > 0 && change.line <= lines.length) {
            lines.splice(change.line - 1, 0, change.content);
            applied = true;
          }
          break;
      }
      
      if (applied) {
        changesApplied++;
      }
    }
    
    // Écrire le fichier modifié
    const newContent = lines.join('\n');
    writeFile(filePath, newContent);
    
    return {
      success: true,
      changesApplied,
      totalChanges: changes.length,
      finalLineCount: lines.length
    };
  } catch (error) {
    throw new Error(`Erreur lors de l'application du patch "${filePath}": ${error.message}`);
  }
} 