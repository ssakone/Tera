████████╗███████╗██████╗  █████╗ 
╚══██╔══╝██╔════╝██╔══██╗██╔══██╗
   ██║   █████╗  ██████╔╝███████║
   ██║   ██╔══╝  ██╔══██╗██╔══██║
   ██║   ███████╗██║  ██║██║  ██║
   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝
```

# TERA - Intelligent AI Development Assistant

> **T**erminal **E**nhanced **R**obot **A**ssistant

A powerful CLI tool that leverages multiple AI providers (OpenAI, OpenRouter, Ollama) to automate development tasks with intelligent streaming, code analysis, and automated workflows.

[![npm version](https://img.shields.io/npm/v/tera-cli.svg)](https://www.npmjs.com/package/tera-cli)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

## ✨ Features

- 🤖 **Multi-Provider AI Support**: OpenAI (GPT-4o, GPT-4), OpenRouter (Claude, Gemini, Llama, etc.), Ollama (local models)
- 📝 **Smart Git Commits**: Automatically generate intelligent commit messages from your staged changes
- 🔧 **Intelligent File Modification**: Modify any file with natural language instructions
- 🔍 **Code Review & Analysis**: Detect bugs, security issues, and performance problems in commits
- 🎯 **Autonomous Agent**: Automate complex development tasks with real-time streaming
- 🧠 **Persistent Memory**: Agent learns from past experiences to improve future tasks
- 💬 **Natural Communication**: Chat interface for conversational interactions
- ⚡ **Dynamic Model Selection**: Fetch and use the latest models from each provider
- 🎨 **Enhanced Patch System**: Intelligent whitespace handling for reliable code modifications

## 🚀 Quick Start

### Installation

```bash
npm install -g tera-cli
```

### Configuration

```bash
# First-time setup - configure your AI provider
tera config

# View current configuration
tera config --show

# Switch between providers
tera config --switch

# Change model for current provider
tera config --model
```

### Supported Providers

| Provider | Models | Description |
|----------|--------|-------------|
| **OpenAI** | GPT-4o, GPT-4, GPT-3.5 | Official OpenAI API with latest models |
| **OpenRouter** | 200+ models | Access to Claude, Gemini, Llama, and more |
| **Ollama** | Local models | Run models locally (Llama, Mistral, CodeLlama, etc.) |

## 📖 Commands Overview

### 🤖 `tera agent` - Autonomous AI Agent

The crown jewel of TERA - an intelligent agent that can automate complex development tasks with streaming AI.

```bash
# Interactive mode
tera agent

# Execute specific task
tera agent "create a React component with tests"

# Auto-approve all actions
tera agent "setup Node.js project" --auto

# Auto-approve specific actions only
tera agent "fix bugs" --auto read_file_lines,patch_file
```

**Agent Capabilities:**
- 📁 File system operations (read, create, modify, organize)
- 🔧 Code modifications with intelligent patching
- 💻 Shell command execution with safety checks
- 🗣️ Natural conversation and status updates
- 🧠 Memory-based learning from past experiences
- ⚡ Real-time streaming responses

**Auto-Approval Actions:**
- `read_file_lines` - Read file contents
- `list_directory` - List directory contents  
- `create_file` - Create new files
- `patch_file` - Modify existing files
- `run_command` - Execute shell commands
- `chat`, `greet`, `apologize` - Communication (always auto-approved)
- `inform_user`, `task_completed` - Status updates (always auto-approved)

### 📝 `tera commit` - Smart Git Commits

Generate intelligent commit messages based on your staged changes.

```bash
# Basic usage
git add .
tera commit

# Add all changes and commit automatically
tera commit -a -y

# Interactive commit with preview
tera commit
```

**Features:**
- ✅ Analyzes staged changes with intelligent diff parsing
- 🎯 Follows conventional commit format (`feat:`, `fix:`, `docs:`, etc.)
- 🌍 Generates messages in French for natural readability
- 📊 Provides detailed change summaries
- ⚡ Supports auto-confirmation with `-y` flag

### 🔧 `tera change` - Intelligent File Modification

Modify any file using natural language instructions with AI.

```bash
# Basic file modification
tera change app.js "add email validation function"

# With automatic backup
tera change config.json "add development environment settings" --backup

# Preview changes before applying
tera change style.css "improve responsive design" --preview
```

**Examples:**
```bash
# Add functionality
tera change utils.js "add function to format dates"

# Fix issues  
tera change api.py "fix the authentication bug in login"

# Refactor code
tera change components.tsx "convert to TypeScript with proper types"

# Add documentation
tera change README.md "add installation section with examples"
```

### 🔍 `tera review` - Code Analysis & Bug Detection

Analyze commits to detect bugs, security issues, and suggest improvements.

```bash
# Review latest commit
tera review

# Review specific commit
tera review --commit abc123

# Review multiple commits
tera review --last 3

# Skip certain file types
tera review --skip ".min.js,.lock"
```

**Analysis Categories:**
- 🐛 **Bug Detection**: Logic errors, null pointer issues, type mismatches
- 🔒 **Security Analysis**: Injection vulnerabilities, data exposure
- ⚡ **Performance Issues**: Inefficient loops, memory leaks
- 📚 **Code Quality**: Naming conventions, structure improvements
- 🛡️ **Error Handling**: Missing try-catch, validation gaps

### ⚙️ `tera config` - Configuration Management

Manage AI providers, models, and settings.

```bash
# Initial setup
tera config

# View current settings
tera config --show

# Switch provider (OpenAI ↔ OpenRouter ↔ Ollama)
tera config --switch

# Change model for current provider
tera config --model

# Dynamic model fetching from API
tera config --model  # Shows live models from your provider
```

### 🧠 `tera memory` - Agent Memory System

View and manage the agent's learning memory.

```bash
# View memory statistics
tera memory

# Clear all learned experiences
tera memory --clear
```

## 🛠️ Advanced Usage

### Auto-Approval Modes

Control which actions require confirmation:

```bash
# Full automation - approve everything
tera agent "deploy to production" --auto

# Selective automation - only safe operations
tera agent "analyze codebase" --auto read_file_lines,list_directory

# Development workflow automation
tera agent "fix bugs" --auto read_file_lines,patch_file,run_command
```

### Provider-Specific Features

#### OpenAI
```bash
# Use latest GPT models with dynamic fetching
tera config --model  # Shows: gpt-4o, gpt-4o-mini, gpt-4-turbo, etc.
```

#### OpenRouter
```bash
# Access 200+ models including Claude, Gemini, Llama
tera config --switch  # Select OpenRouter
tera config --model   # Browse: claude-3, gemini-pro, llama-3, etc.
```

#### Ollama (Local AI)
```bash
# Run models locally for privacy/offline use
tera config --switch  # Select Ollama
tera config --model   # Shows installed: llama3.2, mistral, codellama, etc.

# Install new models
ollama pull llama3.2:latest
tera config --model   # New model appears automatically
```

### Workflow Examples

#### Daily Development Workflow
```bash
# 1. Morning setup - check project status
tera agent "analyze current project structure and suggest improvements"

# 2. Feature development
tera agent "implement user authentication with JWT" --auto read_file_lines,create_file

# 3. Code review
tera review --last 3

# 4. Smart commits
tera commit -a -y
```

#### Bug Fixing Workflow
```bash
# 1. Identify issues
tera review

# 2. Fix automatically
tera agent "fix the security vulnerabilities found in review" --auto patch_file

# 3. Verify fixes
tera change test.js "add tests for security fixes" --backup

# 4. Commit changes
tera commit
```

## 🏗️ Project Structure

```
tera-cli/
├── bin/
│   └── tera.js                 # CLI entry point
├── lib/
│   ├── commands/               # Command implementations
│   │   ├── agent.js           # Autonomous agent
│   │   ├── commit.js          # Smart commits  
│   │   ├── change.js          # File modification
│   │   ├── review.js          # Code analysis
│   │   └── config.js          # Configuration
│   ├── agent_tools/           # Agent capabilities
│   │   ├── chat.js            # Conversational interface
│   │   ├── create_file.js     # File creation
│   │   ├── patch_file.js      # Intelligent file patching
│   │   ├── read_file.js       # File reading
│   │   ├── run_command.js     # Shell execution
│   │   └── inform_user.js     # User communication
│   └── utils/                 # Core utilities
│       ├── openai.js          # AI provider integration
│       ├── config.js          # Configuration management
│       ├── memory.js          # Agent memory system
│       ├── models.js          # Dynamic model fetching
│       ├── git.js             # Git operations
│       ├── file.js            # File system utilities
│       ├── diff.js            # Code diff visualization
│       └── prompt.js          # User interaction
└── package.json
```

## 🔧 Configuration

### Environment Variables

```bash
# Optional - can also use tera config
export OPENAI_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."
export OLLAMA_BASE_URL="http://localhost:11434/v1"
```

### Configuration File

TERA stores settings in `~/.tera-config.json`:

```json
{
  "provider": "openai",
  "openai": {
    "apiKey": "sk-...",
    "model": "gpt-4o"
  },
  "openrouter": {
    "apiKey": "sk-or-...", 
    "model": "openai/gpt-4o"
  },
  "ollama": {
    "baseURL": "http://localhost:11434/v1",
    "model": "llama3.2:latest"
  }
}
```

### Provider Setup

#### OpenAI Setup
1. Visit [platform.openai.com](https://platform.openai.com)
2. Create account and get API key
3. Run `tera config` and select OpenAI

#### OpenRouter Setup  
1. Visit [openrouter.ai](https://openrouter.ai)
2. Create account and get API key
3. Run `tera config` and select OpenRouter
4. Access 200+ models including Claude, Gemini, Llama

#### Ollama Setup
1. Install [Ollama](https://ollama.ai)
2. Start service: `ollama serve`
3. Install models: `ollama pull llama3.2`
4. Run `tera config` and select Ollama

## 🚨 Troubleshooting

### Common Issues

**"API key not configured"**
```bash
tera config  # Reconfigure your provider
```

**"No staged changes found"**
```bash
git add .          # Stage your changes first
tera commit -a     # Or use auto-add flag
```

**"Model not found"**
```bash
tera config --model  # Select from available models
```

**Ollama connection failed**
```bash
ollama serve         # Start Ollama service
ollama pull llama3.2 # Install a model
```

**Patch failures due to whitespace**
- TERA now includes intelligent whitespace handling
- Use `read_file_lines` in agent mode for precise context

### Debug Mode

```bash
# Enable detailed logging
tera agent "debug this issue" --debug
```

### Memory Issues

```bash
# Clear agent memory if behavior seems off
tera memory --clear
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `tera commit` (use TERA itself!)
4. Push branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📝 License

ISC License - see [LICENSE](LICENSE) file.

## 🔗 Links

- **GitHub**: [https://github.com/enokas/tera](https://github.com/enokas/tera)
- **npm**: [https://www.npmjs.com/package/tera-cli](https://www.npmjs.com/package/tera-cli)
- **Issues**: [https://github.com/enokas/tera/issues](https://github.com/enokas/tera/issues)

---

**Made with ❤️ and AI** - TERA is developed using AI assistance to create better AI tools for developers. 