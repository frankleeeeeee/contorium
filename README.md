# Contorium

![Contorium: restore workspace context for AI](demo.gif)

# Persistent Memory Layer for AI Coding

Contorium gives AI a continuous understanding of your workspace, goals, Git changes, and coding sessions.

Instead of losing context every chat, model switch, IDE restart, or session recovery,  
Contorium continuously maintains a structured workspace memory for AI.

Built for developers who work with AI every day.

---

## Repository layout (Cursor Marketplace + VS Code extension)

This repo follows the [Cursor plugin template](https://github.com/cursor/plugin-template) **single-plugin-at-root** layout, with the existing VS Code extension host unchanged:

```text
contorium/
├── .cursor-plugin/plugin.json   # Cursor Marketplace manifest
├── assets/logo.png                # Marketplace logo
├── commands/                      # Agent slash-command docs
├── skills/                        # Agent skills (SKILL.md)
├── rules/                         # Cursor rules (.mdc)
├── package.json                   # VS Code extension manifest (sidebar UI)
├── src/                           # Extension TypeScript source
├── packages/runtime/              # Bundled @contora/runtime
├── packages/mcp/                # MCP server (Claude Code + Cursor Agent)
│   └── dist/server.js           # stdio entry (build with npm run build:mcp)
├── mcp.json                     # Cursor MCP wiring for Marketplace plugin
└── scripts/
    ├── validate-plugin.mjs        # Cursor plugin checklist
    └── package-vsix.cjs           # VSIX build (Open VSX / VS Code)
```

- **Cursor Marketplace**: submit this Git repository ([publish guide](https://cursor.com/marketplace/publish)). Run `npm run validate:plugin` before submission.
- **VS Code / Cursor IDE extension**: build with `npm run vsix` and install the `.vsix` for the sidebar, scanners, and clipboard export.
- **Claude Code / MCP**: build with `npm run build:mcp`, then see [docs/MCP.md](docs/MCP.md) for `claude mcp add` and Cursor `mcp.json` setup.

Internal command and config IDs remain `contora.*`; display name is **Contorium**.

### Versioning

**Single source of truth:** root `package.json` → `"version"`.

After changing the version, run:

```bash
npm run version:sync
```

Or use npm’s version helper (sync runs automatically via `postversion`):

```bash
npm version patch   # 0.5.5 → 0.5.6
```

`npm run compile` / `npm run vsix` also run `version:sync` first.

### Release / packaging (clean install)

Online installs (VSIX or Git clone) must **not** include developer workspace data. Before `npm run vsix` or `git push`:

- **Do not commit** `.contora/` (focus, notes, session JSONL) — gitignored; created per user project at runtime.
- **Do not commit** `.vscode/settings.json` — copy from [`.vscode/settings.example.json`](.vscode/settings.example.json) locally if needed.
- **Do not commit** `*.vsix` — gitignored.
- API keys stay in VS Code **SecretStorage** only (never in the repo).

Fresh install behavior: empty **Current focus**, no session events, default LLM settings from extension manifest (`contora.aiProvider`: `deepseek` until the user changes settings and adds a key).

```bash
git status   # confirm no .contora/ or *.vsix staged
npm run vsix
```

---

# Why Contorium?

Most AI coding tools forget everything.

You switch:
- chats
- models
- sessions
- machines
- IDE windows

…and your AI assistant loses track of:
- what you were building
- which files mattered
- recent Git changes
- project intent
- active debugging context

Contorium fixes that.

It continuously tracks your active workspace and turns it into a persistent AI memory layer.

So your AI can continue where you left off.

---

# What Makes Contorium Different?

Contorium is not another AI chat panel.

It is a:

# Workspace-aware AI Memory System

Contorium continuously maintains:
- current focus
- active files
- recent edits
- Git changes
- workspace intent
- event history
- session summaries
- compressed context memory

All stored locally inside your workspace.

---

# Designed for Real AI Coding Workflows

## Resume AI coding sessions

Close Cursor today.

Open it tomorrow.

Your AI still understands:
- what you were working on
- which files mattered
- what changed
- your coding goal
- recent project activity

---

## Keep AI aware across large codebases

Contorium continuously tracks:
- working-set files
- recent activity
- Git changes
- active editors
- project focus

Perfect for:
- monorepos
- long refactors
- debugging sessions
- AI agent workflows
- large enterprise projects

---

## Switch models without rebuilding context

Move between:
- GPT
- Claude
- Gemini
- DeepSeek

without rebuilding workspace memory every time.

---

## Reduce AI token usage

Large projects can quickly explode token costs.

Contorium reduces unnecessary AI context by:
- tracking only active workspace changes
- prioritizing important files
- compressing recent activity
- filtering noisy paths
- generating compact structured memory

Instead of sending your entire repository every session,
Contorium helps AI focus on what actually matters.

Especially useful for:
- long AI coding sessions
- monorepos
- expensive frontier models
- agent loops
- high-frequency AI workflows

Designed to reduce:
- token usage
- repeated context rebuilding
- unnecessary AI calls
- AI cost overhead

---

# Core Features

## AI Workspace Memory

Persistent workspace state:
- current task
- notes
- active files
- recent activity
- Git changes
- workspace intent
- session memory

Stored locally inside:

```text
.contora/
```

---

## Current Focus Tracking

Set your current focus manually.

Contorium continuously updates surrounding workspace context automatically.

Example:

```text
Current Focus:
Refactor payment retry system

AI inferred goals:
- improve retry stability
- optimize error classification
- reduce duplicate requests
```

---

## Git-aware Context

Contorium automatically tracks:
- staged files
- modified files
- working-tree changes

and prioritizes them in AI context generation.

---

## Context Compression

Large codebases generate noisy AI context.

Contorium compresses workspace activity into:
- semantic summaries
- ranked priority files
- compact event history
- structured memory blocks

Designed for long-running AI workflows.

---

## Workspace Intent Analysis

Analyze project direction using optional BYOK AI providers.

Generate:
- inferred goals
- workspace intent
- feature direction
- task grouping

Results are stored locally and reused across sessions.

---

## Session Recovery

Save and restore:
- open editors
- workspace state
- active memory
- project context

Your AI coding session becomes persistent.

---

## Local-first Architecture

Contorium is designed to work locally first.

- No cloud sync
- No chat log scraping
- No hidden telemetry
- Workspace-owned memory

Your workspace memory stays under your control.

---

## Optional BYOK AI Features

Bring your own API keys:
- OpenAI
- Claude
- Gemini
- DeepSeek

Used only when running optional AI commands.

API keys are stored securely in:
- VS Code SecretStorage

Never inside:
- settings.json

---

# How It Works

```text
Workspace Activity
        ↓
Workspace Scanner
        ↓
Memory Builder
        ↓
Context Compression
        ↓
Structured Workspace Memory
        ↓
Export / Restore / AI Workflows
```

---

# Example Workflow

## 1. Open your project

Contorium begins tracking:
- active files
- recent edits
- Git changes
- workspace activity

---

## 2. Set your current focus

Example:

```text
Refactor payment retry system
```

---

## 3. Work normally

Contorium continuously builds:
- workspace memory
- ranked file priority
- semantic summaries
- event history
- compressed context

---

## 4. Export AI context

One click.

Contorium generates:
- structured memory
- compressed workspace context
- AI-ready summaries

for your preferred model or agent.

---

# Sidebar Features

- AI current focus
- AI inferred goals
- Workspace summary
- Active files
- Git changes
- Context notes
- Session save / restore
- Semantic summary
- Workspace intent analysis
- Context compression preview

---

# Use Cases

## Long Refactors

Keep AI aware across:
- dozens of files
- multiple sessions
- evolving goals

---

## AI Pair Programming

Give your AI assistant:
- project awareness
- Git context
- active workspace intent
- compact memory

---

## Large Monorepos

Reduce noise using:
- ignore rules
- ranking
- token budgets
- compressed workspace memory

---

## AI Agents & Automation

Generate structured workspace memory for:
- agents
- workflows
- automation pipelines
- external AI tools

---

## Expensive Frontier Models

Reduce unnecessary token usage when using:
- GPT-5
- Claude
- Gemini
- long-context workflows

---

# Sidebar Overview

The Contorium sidebar includes:

## AI Status
- current focus
- inferred goals
- model/runtime summary

## Workspace Context
- active files
- recent activity
- Git changes
- workspace notes

## Session Management
- save state
- restore editors
- session persistence

## AI Tools
- semantic summaries
- workspace intent analysis
- compressed context previews

---

# On-Disk Layout

```text
<workspace-root>/
├── .contoraignore
└── .contora/
    ├── state.json
    ├── events/
    ├── last-intent.json
    └── memory/
```

---

# Privacy & Security

- Local-first architecture
- No cloud workspace storage
- No hidden telemetry
- No session scraping
- BYOK optional
- Full workspace ownership

---

# Installation

## VSIX

Extensions → Install from VSIX…

---

## From source

```bash
git clone https://github.com/frankleeeeeee/contora.git

cd contora

npm install

npm run compile
```

Press:

```text
F5
```

to launch Extension Development Host.

---

# Configuration

Key settings include:

| Setting | Description |
|---|---|
| `exportFormat` | markdown / json / cursor / claude / openai |
| `exportTokenBudget` | approximate max export tokens |
| `defaultAIMode` | debug / feature / refactor / review |
| `maxPriorityFiles` | limit ranked file count |
| `eventsInPrompt` | recent events included in exports |
| `persistEventLog` | optional JSONL event logging |
| `appendAiSummaryOnExport` | optional AI-generated summaries |

---

# Tech Stack

- TypeScript
- VS Code Extension API
- simple-git
- Workspace scanners
- Local memory builders
- Structured context adapters

---

# Architecture

```text
src/
├── core/
├── ai/
├── scanner/
├── state/
├── ui/
├── storage/
└── env/
```

---

# Vision

AI coding tools should not lose context every session.

Contorium is building:

# Persistent Workspace Memory for AI

The next layer of AI-native development environments.

---

# Roadmap

Future directions:
- AI timeline memory
- multi-session memory
- team workspace memory
- agent memory systems
- workspace knowledge graphs
- smarter context scheduling
- adaptive token optimization

---

# License

MIT License

---

# Built for developers who work with AI every day.