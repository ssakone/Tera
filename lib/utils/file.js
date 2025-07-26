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
      throw new Error(`Le fichier "${filePath}" n'existe pas`);
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
    throw new Error(`Erreur lors de l'écriture du fichier "${filePath}": ${error.message}`);
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