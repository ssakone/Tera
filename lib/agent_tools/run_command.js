import { promisify } from 'util';
import { exec, spawn } from 'child_process';
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
  let command = params.command;
  const timeout = params.timeout;

  // Détecter les commandes en arrière-plan (se terminant par &)
  const isBackgroundCommand = command.trim().endsWith('&');
  
  // Améliorer les commandes Python pour un meilleur output
  if (command.includes('python') && !command.includes(' -u')) {
    command = command.replace(/python3?/, '$& -u');
    console.log(chalk.yellow('   🐍 Python unbuffered mode activé'));
  }

  console.log(chalk.blue(`🖥️  Commande: ${command}`));
  console.log(chalk.gray(`   📁 Dossier: ${cwd}`));
  if (timeout) {
    console.log(chalk.yellow(`   ⏱️  Timeout automatique: ${timeout}ms (${timeout/1000}s)`));
  }
  if (isBackgroundCommand) {
    console.log(chalk.magenta('   🔄 Commande en arrière-plan détectée'));
  }

  // Pour les commandes en arrière-plan, les lancer et retourner immédiatement
  if (isBackgroundCommand) {
    return await runBackgroundCommand(command, cwd);
  }

  // Pour les commandes avec timeout, utiliser spawn pour capturer l'output en temps réel
  if (timeout) {
    return await runWithSpawn(command, cwd, timeout);
  }

  // Pour les commandes normales, utiliser exec (plus simple)
  try {
    const execOptions = {
      cwd,
      maxBuffer: 1024 * 1024, // 1 Mo de buffer pour grosses sorties
      shell: true,
      env: process.env,
    };

    const { stdout, stderr } = await execAsync(command, execOptions);

    const stdoutTrim = stdout.trim();
    const stderrTrim = stderr.trim();

    console.log(chalk.green('   ✅ Commande exécutée avec succès'));
    if (stdoutTrim) console.log(chalk.gray(`   📤 stdout (${stdoutTrim.length} char):\n${stdoutTrim.slice(0, 500)}${stdoutTrim.length > 500 ? '...' : ''}`));
    if (stderrTrim) console.log(chalk.yellow(`   📥 stderr (${stderrTrim.length} char):\n${stderrTrim.slice(0, 500)}${stderrTrim.length > 500 ? '...' : ''}`));

    const result = `✅ Commande exécutée avec succès\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
    
    console.log(chalk.blue('   📋 Résultat transmis à l\'IA:'));
    console.log(chalk.gray(`   ${result.split('\n').join('\n   ')}`));
    
    return result;
  } catch (error) {
    const stdoutTrim = error.stdout ? error.stdout.toString().trim() : '';
    const stderrTrim = error.stderr ? error.stderr.toString().trim() : '';

    console.log(chalk.red(`   ❌ Commande échouée (code ${error.code ?? 'N/A'})`));
    if (stdoutTrim) console.log(chalk.gray(`   📤 stdout:\n${stdoutTrim.slice(0, 500)}${stdoutTrim.length > 500 ? '...' : ''}`));
    if (stderrTrim) console.log(chalk.yellow(`   📥 stderr:\n${stderrTrim.slice(0, 500)}${stderrTrim.length > 500 ? '...' : ''}`));

    const errMsg = `❌ Commande échouée (code ${error.code ?? 'N/A'})\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
    
    console.log(chalk.blue('   📋 Erreur transmise à l\'IA:'));
    console.log(chalk.gray(`   ${errMsg.split('\n').join('\n   ')}`));
    
    throw new Error(errMsg);
  }
}

/**
 * Utilise spawn pour capturer l'output en temps réel avec timeout
 */
async function runWithSpawn(command, cwd, timeout) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, [], {
      cwd,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let isKilled = false;

    // Capturer stdout en temps réel
    childProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log(chalk.cyan(`   📤 stdout: ${chunk.trim()}`));
    });

    // Capturer stderr en temps réel
    childProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      console.log(chalk.yellow(`   📥 stderr: ${chunk.trim()}`));
    });

    // Timeout automatique
    const timeoutId = setTimeout(() => {
      isKilled = true;
      childProcess.kill('SIGTERM');
      console.log(chalk.yellow(`   ⏱️  Processus tué automatiquement après ${timeout}ms`));
    }, timeout);

    childProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      
      const stdoutTrim = stdout.trim();
      const stderrTrim = stderr.trim();

      if (isKilled) {
        const timeoutResult = `⏱️  Processus tué automatiquement après ${timeout}ms (timeout)\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
        
        console.log(chalk.blue('   📋 Résultat timeout transmis à l\'IA:'));
        console.log(chalk.gray(`   ${timeoutResult.split('\n').join('\n   ')}`));
        
        resolve(timeoutResult);
      } else if (code === 0) {
        const result = `✅ Commande exécutée avec succès (terminée naturellement)\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
        
        console.log(chalk.green('   ✅ Commande terminée naturellement'));
        console.log(chalk.blue('   📋 Résultat transmis à l\'IA:'));
        console.log(chalk.gray(`   ${result.split('\n').join('\n   ')}`));
        
        resolve(result);
      } else {
        const errMsg = `❌ Commande échouée (code ${code})\n📤 stdout:\n${stdoutTrim || '(vide)'}\n📥 stderr:\n${stderrTrim || '(vide)'}\n🔧 Commande: ${command}`;
        
        console.log(chalk.red(`   ❌ Processus terminé avec code ${code}`));
        console.log(chalk.blue('   📋 Erreur transmise à l\'IA:'));
        console.log(chalk.gray(`   ${errMsg.split('\n').join('\n   ')}`));
        
        reject(new Error(errMsg));
      }
    });

    childProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      const errMsg = `❌ Erreur de processus: ${error.message}\n🔧 Commande: ${command}`;
      console.log(chalk.red(`   ❌ Erreur: ${error.message}`));
      reject(new Error(errMsg));
    });
  });
}

/**
 * Lance une commande en arrière-plan et retourne immédiatement
 */
async function runBackgroundCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, [], {
      cwd,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true // Important pour les processus en arrière-plan
    });

    let stdout = '';
    let stderr = '';
    let hasOutput = false;

    // Capturer les premiers outputs pour vérifier que ça démarre
    childProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      hasOutput = true;
      console.log(chalk.cyan(`   📤 stdout: ${chunk.trim()}`));
    });

    childProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      hasOutput = true;
      console.log(chalk.yellow(`   📥 stderr: ${chunk.trim()}`));
    });

    // Gestion immédiate des erreurs de démarrage
    childProcess.on('error', (error) => {
      const errMsg = `❌ Erreur de démarrage du processus en arrière-plan: ${error.message}\n🔧 Commande: ${command}`;
      console.log(chalk.red(`   ❌ Erreur: ${error.message}`));
      reject(new Error(errMsg));
    });

    // Si le processus se termine immédiatement, c'est probablement une erreur
    childProcess.on('close', (code) => {
      if (code !== 0) {
        const errMsg = `❌ Processus en arrière-plan terminé immédiatement avec le code ${code}\n📤 stdout:\n${stdout.trim() || '(vide)'}\n📥 stderr:\n${stderr.trim() || '(vide)'}\n🔧 Commande: ${command}`;
        console.log(chalk.red(`   ❌ Processus terminé immédiatement avec code ${code}`));
        reject(new Error(errMsg));
      }
    });

    // Attendre un court moment pour vérifier que le processus démarre correctement
    setTimeout(() => {
      // Détacher le processus pour qu'il continue en arrière-plan
      childProcess.unref();
      
      const result = `🔄 Processus lancé en arrière-plan (PID: ${childProcess.pid})\n📤 stdout initial:\n${stdout.trim() || '(aucun output initial)'}\n📥 stderr initial:\n${stderr.trim() || '(aucun output initial)'}\n🔧 Commande: ${command}\n\n💡 Le processus continue à s'exécuter en arrière-plan. Utilisez 'ps aux | grep' ou 'jobs' pour le vérifier.`;
      
      console.log(chalk.green(`   🔄 Processus lancé en arrière-plan (PID: ${childProcess.pid})`));
      console.log(chalk.blue('   📋 Résultat transmis à l\'IA:'));
      console.log(chalk.gray(`   ${result.split('\n').join('\n   ')}`));
      
      resolve(result);
    }, 1000); // Attendre 1 seconde pour s'assurer que le processus démarre
  });
} 