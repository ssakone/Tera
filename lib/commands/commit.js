import chalk from 'chalk';
import ora from 'ora';
import { 
  isGitRepository, 
  hasStagedChanges, 
  getStagedChanges, 
  getStagedFiles, 
  commitChanges 
} from '../utils/git.js';
import { generateCommitMessage } from '../utils/openai.js';
import { askConfirmation } from '../utils/prompt.js';
import { isConfigured, setupOpenAIKey } from '../utils/config.js';

/**
 * Commande commit - génère un message de commit intelligent
 */
export async function commitCommand() {
  try {
    // Vérifications préliminaires
    if (!isGitRepository()) {
      console.error(chalk.red('❌ Erreur: Vous n\'êtes pas dans un repository git'));
      process.exit(1);
    }

    if (!hasStagedChanges()) {
      console.error(chalk.red('❌ Erreur: Aucun changement stagé trouvé'));
      console.log(chalk.yellow('💡 Utilisez "git add <fichiers>" pour stager vos changements'));
      process.exit(1);
    }

    // Vérification et configuration de la clé API si nécessaire
    if (!isConfigured()) {
      console.log(chalk.yellow('⚠️  Première utilisation détectée'));
      await setupOpenAIKey();
    }

    // Récupération des changements
    console.log(chalk.blue('📥 Récupération des changements stagés...'));
    const diff = getStagedChanges();
    const files = getStagedFiles();

    if (!diff.trim()) {
      console.error(chalk.red('❌ Erreur: Aucun diff trouvé'));
      process.exit(1);
    }

    console.log(chalk.green(`✅ Changements trouvés dans ${files.length} fichier(s):`));
    files.forEach(file => console.log(chalk.gray(`   - ${file}`)));

    // Génération du message de commit
    const spinner = ora({
      text: 'Génération du message de commit...',
      color: 'cyan'
    }).start();

    let commitMessage;
    try {
      commitMessage = await generateCommitMessage(diff, files);
      spinner.succeed('Message de commit généré');
    } catch (error) {
      spinner.fail('Erreur lors de la génération du message');
      console.error(chalk.red(`❌ ${error.message}`));
      
      if (error.message.includes('non configurée')) {
        console.log(chalk.yellow('\n💡 Reconfigurez votre clé API avec: tera config'));
      }
      
      process.exit(1);
    }

    // Affichage du message proposé
    console.log('\n' + chalk.bgBlue.white.bold(' MESSAGE DE COMMIT PROPOSÉ '));
    console.log(chalk.green('┌' + '─'.repeat(50) + '┐'));
    
    // Gestion des messages multi-lignes
    const messageLines = commitMessage.split('\n');
    messageLines.forEach(line => {
      const padding = ' '.repeat(Math.max(0, 48 - line.length));
      console.log(chalk.green(`│ ${chalk.white(line)}${padding} │`));
    });
    
    console.log(chalk.green('└' + '─'.repeat(50) + '┘\n'));

    // Demande de confirmation
    const confirmed = await askConfirmation('Voulez-vous commiter avec ce message ?');

    if (confirmed) {
      console.log(chalk.blue('🚀 Commit en cours...'));
      const success = commitChanges(commitMessage);
      
      if (success) {
        console.log(chalk.green('✅ Commit effectué avec succès !'));
      } else {
        console.error(chalk.red('❌ Erreur lors du commit'));
        process.exit(1);
      }
    } else {
      console.log(chalk.yellow('⏹️  Commit annulé'));
    }

  } catch (error) {
    console.error(chalk.red(`❌ Erreur inattendue: ${error.message}`));
    process.exit(1);
  }
} 