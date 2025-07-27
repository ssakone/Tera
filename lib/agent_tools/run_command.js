import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import chalk from 'chalk';

const execAsync = promisify(exec);

/**
 * Exécute une commande shell et retourne un rapport détaillé.
 * @param {Object} params - Paramètres.
 * @param {string} params.command - La commande à exécuter.
 * @param {string} [params.cwd='.'] - Répertoire de travail (optionnel).
 * @param {number} [params.timeout] - Timeout en ms pour kill automatique (optionnel).
 * @returns {Promise<string>} Résultat détaillé (stdout / stderr / code).
 */
export async function runCommandWithOutput(params) {
  if (!params || !params.command) {
    throw new Error('Paramètre manquant: command requis');
  }

  const cwd = params.cwd ? path.resolve(params.cwd) : process.cwd();
  const command = params.command;
  const timeout = params.timeout;

  console.log(chalk.blue(`🖥️  Commande: ${command}`));
  console.log(chalk.gray(`   📁 Dossier: ${cwd}`));
  if (timeout) {
    console.log(chalk.yellow(`   ⏱️  Timeout automatique: ${timeout}ms (${timeout/1000}s)`));
  }

  try {
    const execOptions = {
      cwd,
      maxBuffer: 1024 * 1024, // 1 Mo de buffer pour grosses sorties
      shell: true,
      env: process.env,
    };

    if (timeout) {
      execOptions.timeout = timeout;
      execOptions.killSignal = 'SIGTERM';
    }

    const { stdout, stderr } = await execAsync(command, execOptions);

    const stdoutTrim = stdout.trim();
    const stderrTrim = stderr.trim();

    console.log(chalk.green('   ✅ Commande exécutée avec succès'));
    if (timeout) console.log(chalk.yellow(`   ⏱️  Processus terminé automatiquement après ${timeout}ms`));
    if (stdoutTrim) console.log(chalk.gray(`   📤 stdout (${stdoutTrim.length} char):\n${stdoutTrim.slice(0, 500)}${stdoutTrim.length > 500 ? '...' : ''}`));
    if (stderrTrim) console.log(chalk.yellow(`   📥 stderr (${stderrTrim.length} char):\n${stderrTrim.slice(0, 500)}${stderrTrim.length > 500 ? '...' : ''}`));

    const result = `✅ Commande exécutée avec succès${timeout ? ` (timeout ${timeout}ms)` : ''}\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
    
    console.log(chalk.blue('   📋 Résultat transmis à l\'IA:'));
    console.log(chalk.gray(`   ${result.split('\n').join('\n   ')}`));
    
    return result;
  } catch (error) {
    const stdoutTrim = error.stdout ? error.stdout.toString().trim() : '';
    const stderrTrim = error.stderr ? error.stderr.toString().trim() : '';
    const isTimeout = error.signal === 'SIGTERM' && timeout;

    const status = isTimeout ? 
      `⏱️  Processus tué automatiquement après ${timeout}ms (timeout)` : 
      `❌ Commande échouée (code ${error.code ?? 'N/A'})`;

    console.log(chalk.yellow(`   ${status}`));
    if (stdoutTrim) console.log(chalk.gray(`   📤 stdout:\n${stdoutTrim.slice(0, 500)}${stdoutTrim.length > 500 ? '...' : ''}`));
    if (stderrTrim) console.log(chalk.yellow(`   📥 stderr:\n${stderrTrim.slice(0, 500)}${stderrTrim.length > 500 ? '...' : ''}`));

    // Pour un timeout, retourner un succès avec la sortie (pour que l'IA puisse évaluer)
    if (isTimeout) {
      const timeoutResult = `⏱️  Processus tué automatiquement après ${timeout}ms (timeout)\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
      
      console.log(chalk.blue('   📋 Résultat timeout transmis à l\'IA:'));
      console.log(chalk.gray(`   ${timeoutResult.split('\n').join('\n   ')}`));
      
      return timeoutResult;
    }

    // Pour une vraie erreur, lancer l'erreur
    const errMsg = `❌ Commande échouée (code ${error.code ?? 'N/A'})\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
    
    console.log(chalk.blue('   📋 Erreur transmise à l\'IA:'));
    console.log(chalk.gray(`   ${errMsg.split('\n').join('\n   ')}`));
    
    throw new Error(errMsg);
  }
} 