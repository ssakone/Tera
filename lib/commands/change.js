import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { readFile, writeFile, fileExists, getFileInfo, createBackup } from '../utils/file.js';
import { generateCodeModification } from '../utils/openai.js';
import { displayColoredDiff, displayChangeSummary } from '../utils/diff.js';
import { askConfirmation } from '../utils/prompt.js';
import { isConfigured, setupConfig, getActiveConfig } from '../utils/config.js';

/**
 * Commande change - modifie un fichier selon les besoins spécifiés
 */
export async function changeCommand(filePath, need, options) {
  try {
    // Vérifications préliminaires
    if (!filePath) {
      console.error(chalk.red('❌ Erreur: Chemin du fichier requis'));
      console.log(chalk.yellow('💡 Usage: tera change <file_path> "<need>"'));
      process.exit(1);
    }

    if (!need) {
      console.error(chalk.red('❌ Erreur: Description du besoin requis'));
      console.log(chalk.yellow('💡 Usage: tera change <file_path> "<need>"'));
      process.exit(1);
    }

    // Résoudre le chemin absolu
    const absolutePath = path.resolve(filePath);
    
    // Vérifier que le fichier existe
    if (!fileExists(absolutePath)) {
      console.error(chalk.red(`❌ Erreur: Le fichier "${filePath}" n'existe pas`));
      process.exit(1);
    }

    // Vérification et configuration si nécessaire
    if (!isConfigured()) {
      console.log(chalk.yellow('⚠️  Configuration requise pour utiliser cette commande'));
      await setupConfig();
    }

    // Afficher la configuration active
    const activeConfig = getActiveConfig();
    console.log(chalk.blue(`🤖 Utilisation de ${chalk.cyan(activeConfig.provider)} avec le modèle ${chalk.cyan(activeConfig.model)}`));

    // Obtenir les informations du fichier
    const fileInfo = getFileInfo(absolutePath);
    console.log(chalk.blue(`📁 Modification de: ${chalk.cyan(fileInfo.basename)}`));
    console.log(chalk.gray(`   Chemin: ${absolutePath}`));
    console.log(chalk.gray(`   Taille: ${fileInfo.size} octets`));

    // Lire le contenu du fichier
    console.log(chalk.blue('📖 Lecture du fichier...'));
    const originalContent = readFile(absolutePath);

    if (originalContent.length === 0) {
      console.log(chalk.yellow('⚠️  Le fichier est vide'));
      
      const confirmEmpty = await askConfirmation('Voulez-vous continuer avec un fichier vide ?');
      if (!confirmEmpty) {
        console.log(chalk.yellow('⏹️  Opération annulée'));
        process.exit(0);
      }
    }

    // Afficher la demande
    console.log(chalk.blue('\n🎯 Modification demandée:'));
    console.log(chalk.white(`"${need}"`));

    // Générer les modifications avec l'IA
    const spinner = ora({
      text: `Génération des modifications avec ${activeConfig.provider}...`,
      color: 'cyan'
    }).start();

    let modifiedContent;
    try {
      modifiedContent = await generateCodeModification(originalContent, filePath, need);
      spinner.succeed('Modifications générées');
    } catch (error) {
      spinner.fail('Erreur lors de la génération des modifications');
      console.error(chalk.red(`❌ ${error.message}`));
      
      if (error.message.includes('non configurée')) {
        console.log(chalk.yellow('\n💡 Reconfigurez avec: tera config'));
      } else if (error.message.includes('modèle') && error.message.includes('non trouvé')) {
        console.log(chalk.yellow('\n💡 Changez de modèle avec: tera config --switch'));
      }
      
      process.exit(1);
    }

    // Vérifier s'il y a des changements
    if (originalContent === modifiedContent) {
      console.log(chalk.yellow('ℹ️  Aucune modification nécessaire selon l\'IA'));
      console.log(chalk.gray('Le fichier correspond déjà aux exigences spécifiées.'));
      process.exit(0);
    }

    // Afficher le diff coloré
    const hasChanges = displayColoredDiff(originalContent, modifiedContent, filePath);
    
    if (!hasChanges) {
      console.log(chalk.yellow('ℹ️  Aucune modification détectée'));
      process.exit(0);
    }

    // Afficher le résumé des changements
    displayChangeSummary(originalContent, modifiedContent);

    // Demander confirmation
    const confirmed = await askConfirmation('\nVoulez-vous appliquer ces modifications ?');

    if (confirmed) {
      try {
        // Créer une sauvegarde si demandé
        if (options.backup !== false) {
          console.log(chalk.blue('💾 Création d\'une sauvegarde...'));
          const backupPath = createBackup(absolutePath);
          console.log(chalk.green(`✅ Sauvegarde créée: ${path.basename(backupPath)}`));
        }

        // Appliquer les modifications
        console.log(chalk.blue('✏️  Application des modifications...'));
        writeFile(absolutePath, modifiedContent);
        
        console.log(chalk.green('✅ Fichier modifié avec succès !'));
        
        // Afficher des informations post-modification
        const newFileInfo = getFileInfo(absolutePath);
        const sizeDiff = newFileInfo.size - fileInfo.size;
        
        if (sizeDiff > 0) {
          console.log(chalk.gray(`📈 Taille: +${sizeDiff} octets`));
        } else if (sizeDiff < 0) {
          console.log(chalk.gray(`📉 Taille: ${sizeDiff} octets`));
        }

        // Afficher le modèle utilisé
        console.log(chalk.gray(`🤖 Modifié avec: ${activeConfig.provider}/${activeConfig.model}`));

        if (options.preview) {
          console.log(chalk.blue('\n🔍 Contenu modifié (premiers lignes):'));
          const lines = modifiedContent.split('\n');
          lines.slice(0, 10).forEach((line, index) => {
            console.log(chalk.gray(`${String(index + 1).padStart(3, ' ')} │ ${line}`));
          });
          
          if (lines.length > 10) {
            console.log(chalk.gray(`... et ${lines.length - 10} ligne(s) de plus`));
          }
        }
        
      } catch (error) {
        console.error(chalk.red(`❌ Erreur lors de l'application des modifications: ${error.message}`));
        process.exit(1);
      }
    } else {
      console.log(chalk.yellow('⏹️  Modifications annulées'));
      console.log(chalk.gray('Aucun fichier n\'a été modifié.'));
    }

  } catch (error) {
    console.error(chalk.red(`❌ Erreur inattendue: ${error.message}`));
    process.exit(1);
  }
} 