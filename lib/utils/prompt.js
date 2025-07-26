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