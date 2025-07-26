import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { 
  isGitRepository, 
  getCommitInfo, 
  getCommitFiles, 
  getFileAtCommit, 
  getLastCommits,
  commitExists
} from '../utils/git.js';
import { analyzeCode, analyzeCodeBatch } from '../utils/openai.js';
import { fileExists, readFile } from '../utils/file.js';
import { isConfigured, setupConfig, getActiveConfig } from '../utils/config.js';

/**
 * Affiche les résultats d'analyse avec coloration syntaxique (pour un fichier)
 */
function displayAnalysisResults(analysis, filePath) {
  console.log('\n' + chalk.bgBlue.white.bold(` ANALYSE DE ${path.basename(filePath)} `));
  console.log(chalk.gray('─'.repeat(80)));

  // Résumé
  if (analysis.summary) {
    console.log(chalk.blue('📋 Résumé:'));
    console.log(chalk.white(`   ${analysis.summary}\n`));
  }

  // Issues
  if (analysis.issues && analysis.issues.length > 0) {
    console.log(chalk.red.bold(`🐛 ${analysis.issues.length} problème(s) détecté(s):\n`));
    
    analysis.issues.forEach((issue, index) => {
      // Couleur selon la sévérité
      let severityColor = chalk.gray;
      let severityIcon = 'ℹ️';
      
      switch (issue.severity) {
        case 'critical':
          severityColor = chalk.red.bold;
          severityIcon = '🔴';
          break;
        case 'high':
          severityColor = chalk.red;
          severityIcon = '🟠';
          break;
        case 'medium':
          severityColor = chalk.yellow;
          severityIcon = '🟡';
          break;
        case 'low':
          severityColor = chalk.blue;
          severityIcon = '🔵';
          break;
      }

      // Couleur selon le type
      let typeColor = chalk.gray;
      switch (issue.type) {
        case 'bug':
          typeColor = chalk.red;
          break;
        case 'security':
          typeColor = chalk.magenta;
          break;
        case 'performance':
          typeColor = chalk.cyan;
          break;
        case 'style':
          typeColor = chalk.green;
          break;
        case 'error-handling':
          typeColor = chalk.yellow;
          break;
      }

      console.log(`${severityIcon} ${severityColor(issue.severity.toUpperCase())} - ${typeColor(issue.type.toUpperCase())}`);
      console.log(chalk.white.bold(`   ${issue.title}`));
      
      // Toujours afficher le fichier (pour cohérence avec l'analyse par lots)
      console.log(chalk.cyan(`   📁 Fichier: ${path.basename(filePath)}`));
      
      if (issue.line) {
        console.log(chalk.gray(`   📍 Ligne: ${issue.line}`));
      }
      
      console.log(chalk.gray(`   🔍 ${issue.description}`));
      
      if (issue.suggestion) {
        console.log(chalk.green(`   💡 Suggestion: ${issue.suggestion}`));
      }

      if (issue.code_example) {
        console.log(chalk.blue('   📝 Exemple de correction:'));
        // Afficher le code avec une indentation
        const codeLines = issue.code_example.split('\n');
        codeLines.forEach(line => {
          console.log(chalk.cyan(`      ${line}`));
        });
      }
      
      if (index < analysis.issues.length - 1) {
        console.log(); // Ligne vide entre les issues
      }
    });
  } else {
    console.log(chalk.green('✅ Aucun problème détecté dans ce fichier'));
  }

  // Recommandations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log(chalk.blue('\n🎯 Recommandations générales:'));
    analysis.recommendations.forEach(rec => {
      console.log(chalk.gray(`   • ${rec}`));
    });
  }

  console.log(chalk.gray('─'.repeat(80)));
}

/**
 * Trouve le fichier le plus probable pour un problème donné
 */
function deduceFileForIssue(issue, fileNames) {
  // Si le fichier est spécifié dans l'issue, l'utiliser
  if (issue.file) {
    return issue.file;
  }
  if (issue.filename) {
    return issue.filename;
  }
  
  // Essayer de déduire depuis la description ou le titre
  const searchText = `${issue.title} ${issue.description}`.toLowerCase();
  
  for (const fileName of fileNames) {
    const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
    const fullName = path.basename(fileName).toLowerCase();
    
    // Chercher des références au nom du fichier
    if (searchText.includes(baseName) || searchText.includes(fullName)) {
      return fileName;
    }
  }
  
  // Si on a qu'un fichier dans le lot, c'est probablement celui-là
  if (fileNames.length === 1) {
    return fileNames[0];
  }
  
  // Fallback : indiquer qu'on ne sait pas
  return 'Fichier non spécifié';
}

/**
 * Affiche les résultats d'analyse pour un lot de fichiers
 */
function displayBatchAnalysisResults(analysis, fileNames) {
  const filesDisplay = fileNames.map(f => path.basename(f)).join(', ');
  console.log('\n' + chalk.bgBlue.white.bold(` ANALYSE DU LOT: ${filesDisplay} `));
  console.log(chalk.gray('─'.repeat(80)));

  // Résumé
  if (analysis.summary) {
    console.log(chalk.blue('📋 Résumé global:'));
    console.log(chalk.white(`   ${analysis.summary}\n`));
  }

  // Issues
  if (analysis.issues && analysis.issues.length > 0) {
    console.log(chalk.red.bold(`🐛 ${analysis.issues.length} problème(s) détecté(s):\n`));
    
    analysis.issues.forEach((issue, index) => {
      // Couleur selon la sévérité
      let severityColor = chalk.gray;
      let severityIcon = 'ℹ️';
      
      switch (issue.severity) {
        case 'critical':
          severityColor = chalk.red.bold;
          severityIcon = '🔴';
          break;
        case 'high':
          severityColor = chalk.red;
          severityIcon = '🟠';
          break;
        case 'medium':
          severityColor = chalk.yellow;
          severityIcon = '🟡';
          break;
        case 'low':
          severityColor = chalk.blue;
          severityIcon = '🔵';
          break;
      }

      // Couleur selon le type
      let typeColor = chalk.gray;
      switch (issue.type) {
        case 'bug':
          typeColor = chalk.red;
          break;
        case 'security':
          typeColor = chalk.magenta;
          break;
        case 'performance':
          typeColor = chalk.cyan;
          break;
        case 'style':
          typeColor = chalk.green;
          break;
        case 'error-handling':
          typeColor = chalk.yellow;
          break;
      }

      console.log(`${severityIcon} ${severityColor(issue.severity.toUpperCase())} - ${typeColor(issue.type.toUpperCase())}`);
      console.log(chalk.white.bold(`   ${issue.title}`));
      
      // Toujours afficher le fichier (déduire si nécessaire)
      const fileName = deduceFileForIssue(issue, fileNames);
      const displayName = fileName === 'Fichier non spécifié' ? fileName : path.basename(fileName);
      const fileColor = fileName === 'Fichier non spécifié' ? chalk.yellow : chalk.cyan;
      console.log(fileColor(`   📁 Fichier: ${displayName}`));
      
      if (issue.line) {
        console.log(chalk.gray(`   📍 Ligne: ${issue.line}`));
      }
      
      console.log(chalk.gray(`   🔍 ${issue.description}`));
      
      if (issue.suggestion) {
        console.log(chalk.green(`   💡 Suggestion: ${issue.suggestion}`));
      }

      if (issue.code_example) {
        console.log(chalk.blue('   📝 Exemple de correction:'));
        // Afficher le code avec une indentation
        const codeLines = issue.code_example.split('\n');
        codeLines.forEach(line => {
          console.log(chalk.cyan(`      ${line}`));
        });
      }
      
      if (index < analysis.issues.length - 1) {
        console.log(); // Ligne vide entre les issues
      }
    });
  } else {
    console.log(chalk.green('✅ Aucun problème détecté dans ce lot'));
  }

  // Recommandations
  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log(chalk.blue('\n🎯 Recommandations pour ce lot:'));
    analysis.recommendations.forEach(rec => {
      console.log(chalk.gray(`   • ${rec}`));
    });
  }

  console.log(chalk.gray('─'.repeat(80)));
}

/**
 * Parse les patterns d'exclusion depuis l'option skip
 */
function parseSkipPatterns(skipOption) {
  if (!skipOption) return { extensions: [], filenames: [] };
  
  const patterns = skipOption.split(',').map(p => p.trim());
  const extensions = [];
  const filenames = [];
  
  patterns.forEach(pattern => {
    if (pattern.startsWith('.')) {
      // C'est une extension
      extensions.push(pattern.toLowerCase());
    } else {
      // C'est un nom de fichier
      filenames.push(pattern.toLowerCase());
    }
  });
  
  return { extensions, filenames };
}

/**
 * Vérifie si un fichier doit être ignoré selon les patterns
 */
function shouldSkipFile(filePath, skipPatterns) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();
  
  // Vérifier les extensions
  if (skipPatterns.extensions.includes(ext)) {
    return { skip: true, reason: `extension ${ext}` };
  }
  
  // Vérifier les noms de fichiers
  if (skipPatterns.filenames.includes(fileName)) {
    return { skip: true, reason: `nom de fichier ${fileName}` };
  }
  
  return { skip: false, reason: null };
}

/**
 * Affiche les informations d'un commit
 */
function displayCommitInfo(commitInfo) {
  console.log(chalk.bgGreen.black.bold(' INFORMATIONS DU COMMIT '));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.blue('🔖 Hash: ') + chalk.cyan(commitInfo.short));
  console.log(chalk.blue('👤 Auteur: ') + chalk.white(commitInfo.author));
  console.log(chalk.blue('📅 Date: ') + chalk.gray(commitInfo.date));
  console.log(chalk.blue('📝 Message: ') + chalk.white(commitInfo.subject));
  console.log(chalk.gray('─'.repeat(50)));
}

/**
 * Commande review - analyse les commits pour détecter les bugs
 */
export async function reviewCommand(options) {
  try {
    // Vérifications préliminaires
    if (!isGitRepository()) {
      console.error(chalk.red('❌ Erreur: Vous n\'êtes pas dans un repository git'));
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

    let commitsToAnalyze = [];

    // Déterminer quels commits analyser
    if (options.commit) {
      // Commit spécifique
      if (!commitExists(options.commit)) {
        console.error(chalk.red(`❌ Erreur: Le commit "${options.commit}" n'existe pas`));
        process.exit(1);
      }
      const commitInfo = getCommitInfo(options.commit);
      commitsToAnalyze.push(commitInfo);
    } else {
      // Derniers commits
      let count = options.last || 1;
      if (count > 10) {
        console.log(chalk.yellow('⚠️  Limite maximum: 10 commits'));
        count = 10;
      }
      commitsToAnalyze = getLastCommits(count);
    }

    // Parser les patterns d'exclusion
    const skipPatterns = parseSkipPatterns(options.skip);
    if (options.skip) {
      console.log(chalk.yellow('⚠️  Patterns d\'exclusion:'));
      if (skipPatterns.extensions.length > 0) {
        console.log(chalk.gray(`   Extensions: ${skipPatterns.extensions.join(', ')}`));
      }
      if (skipPatterns.filenames.length > 0) {
        console.log(chalk.gray(`   Fichiers: ${skipPatterns.filenames.join(', ')}`));
      }
      console.log();
    }

    console.log(chalk.blue(`📊 Analyse de ${commitsToAnalyze.length} commit(s)...\n`));

    // Analyser chaque commit
    for (const commitInfo of commitsToAnalyze) {
      console.log(chalk.bgYellow.black.bold(` ANALYSE DU COMMIT ${commitInfo.short} `));
      displayCommitInfo(commitInfo);

      // Récupérer les fichiers modifiés
      const files = getCommitFiles(commitInfo.hash);
      console.log(chalk.blue(`📁 ${files.length} fichier(s) modifié(s):`));
      files.forEach(file => console.log(chalk.gray(`   - ${file}`)));

            // Filtrer et préparer les fichiers de code
      const codeExtensions = [
        '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',           // JavaScript/TypeScript
        '.py', '.pyx', '.pyi',                                   // Python
        '.java', '.kt', '.kts', '.scala',                       // JVM Languages
        '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',      // C/C++
        '.cs', '.vb', '.fs',                                    // .NET Languages
        '.php', '.php3', '.php4', '.php5', '.phtml',           // PHP
        '.rb', '.rake', '.gemspec',                             // Ruby
        '.go', '.mod', '.sum',                                  // Go
        '.rs', '.toml',                                         // Rust
        '.swift',                                               // Swift
        '.dart',                                                // Dart/Flutter
        '.m', '.mm', '.h',                                      // Objective-C
        '.vue', '.svelte',                                      // Frontend Frameworks
        '.xml', '.html', '.htm', '.xhtml',                     // Markup
        '.css', '.scss', '.sass', '.less', '.styl',            // Styles
        '.sql', '.mysql', '.pgsql', '.sqlite',                 // SQL
        '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat',       // Scripts
        '.yaml', '.yml', '.json', '.toml', '.ini', '.conf',    // Config
        '.gradle', '.gradle.kts', '.cmake', '.make', '.mk',    // Build files
        '.r', '.R', '.rmd',                                     // R
        '.jl',                                                  // Julia
        '.elm',                                                 // Elm
        '.ex', '.exs',                                          // Elixir
        '.erl', '.hrl',                                         // Erlang
        '.clj', '.cljs', '.cljc',                              // Clojure
        '.hs', '.lhs',                                          // Haskell
        '.ml', '.mli',                                          // OCaml
        '.lua',                                                 // Lua
        '.pl', '.pm', '.t',                                     // Perl
        '.nim', '.nims',                                        // Nim
        '.cr',                                                  // Crystal
        '.zig'                                                  // Zig
      ];
      
      const specialFiles = [
        'dockerfile', 'makefile', 'rakefile', 'gemfile', 'podfile',
        'fastfile', 'appfile', 'deliverfile', 'matchfile', 'scanfile',
        'gymfile', 'snapfile', 'gradlew'
      ];

      // Collecter tous les fichiers de code valides
      const codeFiles = [];
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const fileName = path.basename(file).toLowerCase();
        const isCodeFile = codeExtensions.includes(ext) || specialFiles.includes(fileName);
        
        // Vérifier si le fichier doit être ignoré selon les patterns utilisateur
        const skipCheck = shouldSkipFile(file, skipPatterns);
        if (skipCheck.skip) {
          console.log(chalk.magenta(`   🚫 Ignoré: ${file} (${skipCheck.reason})`));
          continue;
        }
        
        if (!isCodeFile) {
          console.log(chalk.gray(`   ⏭️  Ignoré: ${file} (pas un fichier de code)`));
          continue;
        }

        try {
          const fileContent = getFileAtCommit(file, commitInfo.hash);
          if (!fileContent) {
            console.log(chalk.yellow(`   ⚠️  Fichier supprimé ou vide: ${file}`));
            continue;
          }

          codeFiles.push({
            path: file,
            content: fileContent
          });
        } catch (error) {
          console.error(chalk.red(`   ❌ Erreur lors de la lecture de ${file}: ${error.message}`));
        }
      }

      if (codeFiles.length === 0) {
        console.log(chalk.yellow('\n⚠️  Aucun fichier de code à analyser'));
        continue;
      }

      console.log(chalk.blue(`\n🔍 Analyse de ${codeFiles.length} fichier(s) de code par lots...`));

      // Traiter les fichiers par lots de 3
      const batchSize = 3;
      let totalIssues = 0;

      for (let i = 0; i < codeFiles.length; i += batchSize) {
        const batch = codeFiles.slice(i, i + batchSize);
        const batchFileNames = batch.map(f => f.path);
        
        console.log(chalk.blue(`\n📦 Lot ${Math.floor(i / batchSize) + 1}: ${batch.map(f => path.basename(f.path)).join(', ')}`));

        const spinner = ora({
          text: `Analyse IA du lot (${batch.length} fichier(s))...`,
          color: 'cyan'
        }).start();

        try {
          const analysis = await analyzeCodeBatch(batch, commitInfo);
          spinner.succeed(`Analyse terminée pour le lot de ${batch.length} fichier(s)`);

          // Afficher les résultats
          displayBatchAnalysisResults(analysis, batchFileNames);
          
          if (analysis.issues) {
            totalIssues += analysis.issues.length;
          }

        } catch (error) {
          spinner.fail(`Erreur lors de l'analyse du lot`);
          console.error(chalk.red(`   ❌ ${error.message}`));
        }
      }

      // Résumé du commit
      console.log(chalk.bgBlue.white.bold(' RÉSUMÉ DU COMMIT '));
      console.log(chalk.gray('─'.repeat(40)));
      
      if (totalIssues > 0) {
        console.log(chalk.red(`🚨 ${totalIssues} problème(s) détecté(s) au total`));
      } else {
        console.log(chalk.green('✅ Aucun problème détecté'));
      }
      
      console.log(chalk.gray(`🤖 Analysé avec: ${activeConfig.provider}/${activeConfig.model}`));
      console.log(chalk.gray('─'.repeat(40)));

      // Espacement entre les commits
      if (commitsToAnalyze.length > 1) {
        console.log('\n' + '='.repeat(80) + '\n');
      }
    }

    console.log(chalk.green('\n🎉 Analyse terminée !'));

  } catch (error) {
    console.error(chalk.red(`❌ Erreur inattendue: ${error.message}`));
    process.exit(1);
  }
} 