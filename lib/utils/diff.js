import { diffLines, diffWordsWithSpace } from 'diff';
import chalk from 'chalk';

/**
 * Génère un diff entre deux contenus et l'affiche de manière colorée
 */
export function displayColoredDiff(originalContent, modifiedContent, filePath) {
  const diff = diffLines(originalContent, modifiedContent);
  
  if (!diff.some(part => part.added || part.removed)) {
    console.log(chalk.yellow('⚠️  Aucune modification détectée'));
    return false;
  }

  console.log('\n' + chalk.bgBlue.white.bold(` MODIFICATIONS PROPOSÉES POUR ${filePath} `));
  console.log(chalk.gray('─'.repeat(80)));

  let lineNumber = 1;
  
  diff.forEach(part => {
    const lines = part.value.split('\n');
    
    // Retirer la dernière ligne vide si elle existe
    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    lines.forEach((line, index) => {
      if (part.added) {
        console.log(chalk.green(`+ ${String(lineNumber).padStart(3, ' ')} │ ${line}`));
        lineNumber++;
      } else if (part.removed) {
        console.log(chalk.red(`- ${String(lineNumber).padStart(3, ' ')} │ ${line}`));
      } else {
        console.log(chalk.gray(`  ${String(lineNumber).padStart(3, ' ')} │ ${line}`));
        lineNumber++;
      }
    });
  });

  console.log(chalk.gray('─'.repeat(80)));
  return true;
}

/**
 * Affiche un résumé des changements
 */
export function displayChangeSummary(originalContent, modifiedContent) {
  const originalLines = originalContent.split('\n');
  const modifiedLines = modifiedContent.split('\n');
  const diff = diffLines(originalContent, modifiedContent);

  let added = 0;
  let removed = 0;
  let modified = 0;

  diff.forEach(part => {
    const lines = part.value.split('\n').filter(line => line !== '');
    
    if (part.added) {
      added += lines.length;
    } else if (part.removed) {
      removed += lines.length;
    }
  });

  // Calculer les lignes modifiées (approximation)
  modified = Math.min(added, removed);
  added -= modified;
  removed -= modified;

  console.log('\n' + chalk.blue('📊 Résumé des changements:'));
  
  if (added > 0) {
    console.log(chalk.green(`  + ${added} ligne(s) ajoutée(s)`));
  }
  
  if (removed > 0) {
    console.log(chalk.red(`  - ${removed} ligne(s) supprimée(s)`));
  }
  
  if (modified > 0) {
    console.log(chalk.yellow(`  ~ ${modified} ligne(s) modifiée(s)`));
  }

  console.log(chalk.gray(`  📏 Total: ${originalLines.length} → ${modifiedLines.length} lignes`));
}

/**
 * Génère un diff compact pour les petites modifications
 */
export function displayInlineDiff(originalLine, modifiedLine) {
  const diff = diffWordsWithSpace(originalLine, modifiedLine);
  
  let result = '';
  diff.forEach(part => {
    if (part.added) {
      result += chalk.green.inverse(part.value);
    } else if (part.removed) {
      result += chalk.red.inverse(part.value);
    } else {
      result += part.value;
    }
  });
  
  return result;
}

/**
 * Affiche un aperçu rapide des zones modifiées
 */
export function displayQuickPreview(originalContent, modifiedContent, maxLines = 10) {
  const diff = diffLines(originalContent, modifiedContent);
  const changes = diff.filter(part => part.added || part.removed);
  
  if (changes.length === 0) {
    console.log(chalk.yellow('ℹ️  Aucune modification détectée'));
    return;
  }

  console.log(chalk.blue(`\n🔍 Aperçu des ${Math.min(changes.length, maxLines)} première(s) modification(s):`));
  
  changes.slice(0, maxLines).forEach((part, index) => {
    const prefix = part.added ? chalk.green('+ ') : chalk.red('- ');
    const lines = part.value.split('\n').filter(line => line.trim() !== '');
    
    lines.slice(0, 2).forEach(line => {
      console.log(prefix + line.substring(0, 60) + (line.length > 60 ? '...' : ''));
    });
    
    if (lines.length > 2) {
      console.log(chalk.gray(`    ... et ${lines.length - 2} ligne(s) de plus`));
    }
  });

  if (changes.length > maxLines) {
    console.log(chalk.gray(`\n... et ${changes.length - maxLines} modification(s) de plus`));
  }
} 