# Contorium — Integrated upgrade plan (2.0 → 2.1 spec)

This document merges the **four-layer architecture** from the v2.0 architecture notes with the **engineering specification** from the v2.1 notes (both are Markdown files at the repository root; filenames may use non-ASCII characters in older copies).  
Relationship: **2.0** defines the conceptual modules and data flow; **2.1** refines types (immutable events, `EventStore.getLast`, `WorkspaceMemory.gitState` with staged vs working), **Context Builder** sections (`# TASK`, `# MODE`, …), and the **monorepo** packaging story.  
**This repository** implements the **same logical layers inside a single VS Code extension package** (`src/core/`) instead of a full pnpm monorepo, to ship faster without losing architecture boundaries.

---

## The four layers (unified)

| Layer | 2.0 emphasis | 2.1 emphasis | Implementation in this repo |
|-------|----------------|----------------|----------------------------|
| **1. VS Code Extension / UI** | Commands, sidebar, thin shell | “VS Code only collects + calls core” | `src/extension.ts`, `src/ui/sidebarProvider.ts`, `src/state/recovery.ts` |
| **2. Event Collection** | Hooks → event push, `EventBuffer` | Immutable event log, `EventStore.getLast(n)` | `src/scanner/*` + `src/core/engine/eventStore.ts` |
| **3. Context Engine Core** | `MemoryBuilder`, `ContextEngine`, modes | Explicit `WorkspaceMemory`, `MemoryBuilder` algorithms, `ContextBuilder` prompt sections | `src/core/engine/memoryBuilder.ts`, `src/core/context/contextBuilder.ts`, `src/core/context/modeEngine.ts` |
| **4. AI Adapter Layer** | ChatGPT / Cursor / JSON | Same + structured JSON for future MCP | `src/core/adapters/exportAdapters.ts` |

**Between 2.0 and 2.1:** 2.1 adds **product boundaries** (no cloud in phase 2.0), **prompt schema** with headings, and **roadmap phases** (mode system + JSON → MCP later). This codebase delivers **Phase 1–2**: events + memory + structured prompt + modes + export formats (markdown / cursor markers / JSON).

---

## Data flow (both docs agree)

```text
VS Code hooks
    → EventStore (ring buffer)
    → MemoryBuilder (ProjectState + events → WorkspaceMemory)
    → ContextBuilder (+ ModeEngine)
    → Export adapter → clipboard / JSON
```

Persistent truth is **`.Contorium/state.json`** (legacy **`.context-recall/state.json`** is read if present); the event buffer is **session memory** for recent activity (bounded).

---

## Deliberately out of scope (per specs)

- Cloud sync, team memory, MCP server (placeholder via JSON export only).
- Auto task extraction from Cursor Chat.
- Full monorepo (`packages/core`, etc.) — optional future split.

---

## Version

Implemented from extension **0.3.0** onward with `src/core/` module; settings namespace is **`contorium.*`** (formerly `contextRecall.*`): e.g. `contorium.defaultAIMode`, `contorium.exportFormat`, `contorium.maxEventBuffer`.
