import readline from 'readline';
import chalk from 'chalk';

/**
 * Demande une confirmation y/n à l'utilisateur
 */
export function askConfirmation(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prompt = () => {
      rl.question(`${message} ${chalk.gray('(y/n)')} `, (answer) => {
        const normalized = answer.toLowerCase().trim();
        
        if (normalized === 'y' || normalized === 'yes' || normalized === 'o' || normalized === 'oui') {
          rl.close();
          resolve(true);
        } else if (normalized === 'n' || normalized === 'no' || normalized === 'non') {
          rl.close();
          resolve(false);
        } else {
          console.log(chalk.yellow('Veuillez répondre par y (oui) ou n (non)'));
          prompt();
        }
      });
    };

    prompt();
  });
}

/**
 * Demande une saisie de texte à l'utilisateur
 */
export function askInput(message, isSecret = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Pour les saisies secrètes (comme les clés API), on masque l'affichage
    if (isSecret) {
      rl.stdoutMuted = true;
      rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (rl.stdoutMuted) {
          rl.output.write('\x1B[2K\x1B[200D' + message + ' ' + '*'.repeat(rl.line.length));
        } else {
          rl.output.write(stringToWrite);
        }
      };
    }

    rl.question(`${message} `, (answer) => {
      rl.close();
      if (isSecret) {
        console.log(); // Nouvelle ligne après la saisie secrète
      }
      resolve(answer.trim());
    });
  });
}

/**
 * Demande des instructions à l'utilisateur pour corriger un problème
 */
export function askInstructions(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(chalk.cyan(message), (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Propose des options à l'utilisateur quand quelque chose ne va pas
 */
export function askRecoveryAction(errorContext = '') {
  console.log('\n' + chalk.yellow('🔧 Options de récupération:'));
  console.log(chalk.blue('  1') + chalk.gray(' - Donner des instructions à l\'IA pour réessayer'));
  console.log(chalk.blue('  2') + chalk.gray(' - Demander à l\'IA de générer un nouveau plan'));
  console.log(chalk.blue('  3') + chalk.gray(' - Arrêter le processus'));
  
  if (errorContext) {
    console.log(chalk.gray(`\n💡 Contexte: ${errorContext}`));
  }
  
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = () => {
      rl.question(chalk.cyan('\n🤖 Choisissez une option (1-3): '), (answer) => {
        const choice = answer.trim();
        if (choice === '1') {
          rl.question(chalk.cyan('\n💬 Que voulez-vous dire à l\'IA ? '), (instructions) => {
            rl.close();
            resolve({ action: 'instruct', instructions: instructions.trim() });
          });
        } else if (choice === '2') {
          rl.close();
          resolve({ action: 'retry' });
        } else if (choice === '3') {
          rl.close();
          resolve({ action: 'abort' });
        } else {
          console.log(chalk.yellow('Veuillez choisir 1, 2 ou 3'));
          ask();
        }
      });
    };
    ask();
  });
}

/**
 * Confirmation avancée avec options de récupération
 */
export async function askAdvancedConfirmation(message, allowInstructions = false) {
  if (!allowInstructions) {
    return await askConfirmation(message);
  }

  console.log(chalk.cyan(message));
  console.log(chalk.gray('  y/oui - Oui, continuer'));
  console.log(chalk.gray('  n/non - Non, voir les options'));
  
  const confirmed = await askConfirmation('');
  
  if (!confirmed) {
    const recovery = await askRecoveryAction('L\'utilisateur a refusé de continuer');
    return { confirmed: false, recovery };
  }
  
  return { confirmed: true };
} 