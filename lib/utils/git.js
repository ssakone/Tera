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

/**
 * Récupère les informations d'un commit spécifique
 */
export function getCommitInfo(commitHash = 'HEAD') {
  try {
    // Utiliser un format séparé pour éviter les problèmes de JSON avec les caractères spéciaux
    const hashResult = execSync(`git show ${commitHash} --pretty=format:"%H" -s`, { encoding: 'utf8' }).trim();
    const shortResult = execSync(`git show ${commitHash} --pretty=format:"%h" -s`, { encoding: 'utf8' }).trim();
    const authorResult = execSync(`git show ${commitHash} --pretty=format:"%an" -s`, { encoding: 'utf8' }).trim();
    const emailResult = execSync(`git show ${commitHash} --pretty=format:"%ae" -s`, { encoding: 'utf8' }).trim();
    const dateResult = execSync(`git show ${commitHash} --pretty=format:"%ad" -s --date=iso`, { encoding: 'utf8' }).trim();
    const subjectResult = execSync(`git show ${commitHash} --pretty=format:"%s" -s`, { encoding: 'utf8' }).trim();
    const bodyResult = execSync(`git show ${commitHash} --pretty=format:"%b" -s`, { encoding: 'utf8' }).trim();
    
    return {
      hash: hashResult,
      short: shortResult,
      author: authorResult,
      email: emailResult,
      date: dateResult,
      subject: subjectResult,
      body: bodyResult
    };
  } catch (error) {
    throw new Error(`Erreur lors de la récupération du commit ${commitHash}: ${error.message}`);
  }
}

/**
 * Récupère le diff d'un commit spécifique
 */
export function getCommitDiff(commitHash = 'HEAD') {
  try {
    const diff = execSync(`git show ${commitHash} --format=""`, { encoding: 'utf8' });
    return diff;
  } catch (error) {
    throw new Error(`Erreur lors de la récupération du diff du commit ${commitHash}: ${error.message}`);
  }
}

/**
 * Récupère les fichiers modifiés dans un commit
 */
export function getCommitFiles(commitHash = 'HEAD') {
  try {
    const files = execSync(`git show ${commitHash} --name-only --format=""`, { encoding: 'utf8' });
    return files.trim().split('\n').filter(file => file.length > 0);
  } catch (error) {
    throw new Error(`Erreur lors de la récupération des fichiers du commit ${commitHash}: ${error.message}`);
  }
}

/**
 * Récupère les n derniers commits
 */
export function getLastCommits(count = 1) {
  try {
    // Récupérer les hashes des commits
    const hashesResult = execSync(`git log -${count} --pretty=format:"%H"`, { encoding: 'utf8' });
    const hashes = hashesResult.trim().split('\n').filter(hash => hash.length > 0);
    
    // Pour chaque hash, récupérer les informations détaillées
    const commits = [];
    for (const hash of hashes) {
      const shortResult = execSync(`git show ${hash} --pretty=format:"%h" -s`, { encoding: 'utf8' }).trim();
      const authorResult = execSync(`git show ${hash} --pretty=format:"%an" -s`, { encoding: 'utf8' }).trim();
      const dateResult = execSync(`git show ${hash} --pretty=format:"%ad" -s --date=relative`, { encoding: 'utf8' }).trim();
      const subjectResult = execSync(`git show ${hash} --pretty=format:"%s" -s`, { encoding: 'utf8' }).trim();
      
      commits.push({
        hash: hash,
        short: shortResult,
        author: authorResult,
        date: dateResult,
        subject: subjectResult
      });
    }
    
    return commits;
  } catch (error) {
    throw new Error(`Erreur lors de la récupération des derniers commits: ${error.message}`);
  }
}

/**
 * Récupère le contenu d'un fichier à un commit spécifique
 */
export function getFileAtCommit(filePath, commitHash = 'HEAD') {
  try {
    const content = execSync(`git show ${commitHash}:${filePath}`, { encoding: 'utf8' });
    return content;
  } catch (error) {
    // Le fichier peut ne pas exister dans ce commit (nouveau fichier)
    return null;
  }
}

/**
 * Vérifie si un commit existe
 */
export function commitExists(commitHash) {
  try {
    execSync(`git cat-file -e ${commitHash}^{commit}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
} 