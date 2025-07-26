import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * Vérifie si nous sommes dans un repository git
 */
export function isGitRepository() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie s'il y a des changements stagés
 */
export function hasStagedChanges() {
  try {
    const result = execSync('git diff --staged --name-only', { encoding: 'utf8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Récupère les changements stagés avec le diff
 */
export function getStagedChanges() {
  try {
    const diff = execSync('git diff --staged', { encoding: 'utf8' });
    return diff;
  } catch (error) {
    throw new Error(`Erreur lors de la récupération des changements: ${error.message}`);
  }
}

/**
 * Récupère les fichiers modifiés
 */
export function getStagedFiles() {
  try {
    const files = execSync('git diff --staged --name-only', { encoding: 'utf8' });
    return files.trim().split('\n').filter(file => file.length > 0);
  } catch (error) {
    throw new Error(`Erreur lors de la récupération des fichiers: ${error.message}`);
  }
}

/**
 * Effectue le commit avec le message donné
 */
export function commitChanges(message) {
  try {
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(chalk.red(`Erreur lors du commit: ${error.message}`));
    return false;
  }
} 