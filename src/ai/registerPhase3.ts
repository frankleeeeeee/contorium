import * as vscode from 'vscode';
import { CONTORA_CONFIG_SECTION, PRODUCT_DISPLAY_NAME } from '../constants';
import type { EventStore } from '../core/engine/eventStore';
import { MemoryBuilder } from '../core/engine/memoryBuilder';
import { ModeEngine } from '../core/context/modeEngine';
import type { StateManager } from '../state/stateManager';
import { buildWorkspaceMemorySnapshot } from './buildWorkspaceMemorySnapshot';
import { ContoraKeyManager, type StoredProviderId } from './auth/keyManager';
import { ProviderManager } from './providers/providerManager';

export interface Phase3SharedClients {
  keys: ContoraKeyManager;
  providers: ProviderManager;
}
import { readAiRuntimeSettings } from './auth/providerConfig';
import { runCloudSemanticSummary } from './runtime/semanticSummary/summaryEngine';
import { runWorkspaceIntentAnalysis } from './runtime/intent/intentEngine';
import { writePersistedIntent } from '../core/memory/intentStore';
import { compressContextText } from './runtime/compression/compressionEngine';

export interface Phase3RegisterDeps {
  stateManager: StateManager;
  getEventStore: () => EventStore | undefined;
  memoryBuilder: MemoryBuilder;
  modeEngine: ModeEngine;
  flushScanners: () => Promise<void>;
  eventsInPrompt: () => number;
  exportTokenBudget: () => number;
  maxPriorityFilesCap: (strategyMax: number) => number;
  shouldIgnore: () => (p: string) => boolean;
  /** Refresh ${PRODUCT_DISPLAY_NAME} sidebar after AI intent is written so goals list updates. */
  refreshSidebar?: () => void | Promise<void>;
}

async function openMarkdownPreview(title: string, body: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({
    content: `# ${title}\n\n${body}`,
    language: 'markdown',
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

export function registerPhase3AiRuntime(
  context: vscode.ExtensionContext,
  deps: Phase3RegisterDeps,
  shared?: Phase3SharedClients,
): void {
  const keys = shared?.keys ?? new ContoraKeyManager(context.secrets);
  const providers = shared?.providers ?? new ProviderManager(keys);

  context.subscriptions.push(
    vscode.commands.registerCommand('contora.configureApiKey', async () => {
      const sel = await vscode.window.showQuickPick(
        [
          { label: 'OpenAI', description: 'openai' },
          { label: 'Anthropic (Claude)', description: 'anthropic' },
          { label: 'Google Gemini', description: 'google' },
          { label: 'DeepSeek', description: 'deepseek' },
          { label: `Clear all ${PRODUCT_DISPLAY_NAME} API keys`, description: 'clear' },
        ],
        { title: `${PRODUCT_DISPLAY_NAME}: API key (stored in SecretStorage only)` },
      );
      if (!sel?.description) {
        return;
      }
      if (sel.description === 'clear') {
        await keys.deleteKey('openai');
        await keys.deleteKey('anthropic');
        await keys.deleteKey('google');
        await keys.deleteKey('deepseek');
        await vscode.window.showInformationMessage(`${PRODUCT_DISPLAY_NAME}: Cleared stored API keys.`);
        return;
      }
      const pid = sel.description as StoredProviderId;
      const input = await vscode.window.showInputBox({
        title: `${PRODUCT_DISPLAY_NAME}: API key for ${sel.label}`,
        password: true,
        ignoreFocusOut: true,
        prompt: 'Key is stored with vscode.SecretStorage (never in settings.json).',
      });
      if (!input) {
        return;
      }
      await keys.setKey(pid, input.trim());
      await vscode.window.showInformationMessage(
        `${PRODUCT_DISPLAY_NAME}: Saved ${sel.label} key. Set "contora.aiProvider" to "${pid}" to use it.`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('contora.generateSemanticSummary', async () => {
      const folder = deps.stateManager.getPrimaryFolder();
      const es = deps.getEventStore();
      if (!folder || !es) {
        await vscode.window.showWarningMessage(`${PRODUCT_DISPLAY_NAME}: Open a folder workspace first.`);
        return;
      }
      await deps.flushScanners();
      const cfg = vscode.workspace.getConfiguration(CONTORA_CONFIG_SECTION);
      const snap = await buildWorkspaceMemorySnapshot({
        folder,
        stateManager: deps.stateManager,
        eventStore: es,
        memoryBuilder: deps.memoryBuilder,
        modeEngine: deps.modeEngine,
        defaultModeRaw: cfg.get<string>('defaultAIMode'),
        eventsInPromptCount: deps.eventsInPrompt(),
        exportTokenBudget: deps.exportTokenBudget(),
        maxPriorityFilesCap: deps.maxPriorityFilesCap,
        shouldIgnore: deps.shouldIgnore(),
      });
      if (!snap) {
        return;
      }
      try {
        const text = await runCloudSemanticSummary(snap.memory, snap.heuristicSemanticMarkdown, providers);
        await openMarkdownPreview(`${PRODUCT_DISPLAY_NAME} — Workspace observation (AI summary)`, text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`${PRODUCT_DISPLAY_NAME}: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('contora.analyzeWorkspaceIntent', async () => {
      const folder = deps.stateManager.getPrimaryFolder();
      const es = deps.getEventStore();
      if (!folder || !es) {
        await vscode.window.showWarningMessage(`${PRODUCT_DISPLAY_NAME}: Open a folder workspace first.`);
        return;
      }
      await deps.flushScanners();
      const cfg = vscode.workspace.getConfiguration(CONTORA_CONFIG_SECTION);
      const snap = await buildWorkspaceMemorySnapshot({
        folder,
        stateManager: deps.stateManager,
        eventStore: es,
        memoryBuilder: deps.memoryBuilder,
        modeEngine: deps.modeEngine,
        defaultModeRaw: cfg.get<string>('defaultAIMode'),
        eventsInPromptCount: deps.eventsInPrompt(),
        exportTokenBudget: deps.exportTokenBudget(),
        maxPriorityFilesCap: deps.maxPriorityFilesCap,
        shouldIgnore: deps.shouldIgnore(),
      });
      if (!snap) {
        return;
      }
      try {
        const intent = await runWorkspaceIntentAnalysis(snap.memory, providers);
        const relatedFiles = (snap.memory.priorityFiles ?? []).map((p) => p.path);
        await writePersistedIntent(folder, intent, relatedFiles);
        await openMarkdownPreview(`${PRODUCT_DISPLAY_NAME} — Workspace intent snapshot (JSON)`, JSON.stringify(intent, null, 2));
        await deps.refreshSidebar?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`${PRODUCT_DISPLAY_NAME}: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('contora.compressContextPreview', async () => {
      const folder = deps.stateManager.getPrimaryFolder();
      const es = deps.getEventStore();
      if (!folder || !es) {
        await vscode.window.showWarningMessage(`${PRODUCT_DISPLAY_NAME}: Open a folder workspace first.`);
        return;
      }
      await deps.flushScanners();
      const cfg = vscode.workspace.getConfiguration(CONTORA_CONFIG_SECTION);
      const snap = await buildWorkspaceMemorySnapshot({
        folder,
        stateManager: deps.stateManager,
        eventStore: es,
        memoryBuilder: deps.memoryBuilder,
        modeEngine: deps.modeEngine,
        defaultModeRaw: cfg.get<string>('defaultAIMode'),
        eventsInPromptCount: deps.eventsInPrompt(),
        exportTokenBudget: deps.exportTokenBudget(),
        maxPriorityFilesCap: deps.maxPriorityFilesCap,
        shouldIgnore: deps.shouldIgnore(),
      });
      if (!snap) {
        return;
      }
      const budget = (() => {
        const b = deps.exportTokenBudget();
        return b <= 0 ? 4000 : Math.max(1, b);
      })();
      const useAi = readAiRuntimeSettings().aiProvider !== 'off';
      try {
        const out = await compressContextText(
          { text: snap.heuristicSemanticMarkdown, approxTokenBudget: budget },
          providers,
          useAi,
        );
        await openMarkdownPreview(`${PRODUCT_DISPLAY_NAME} — Tightened context preview`, out);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode.window.showErrorMessage(`${PRODUCT_DISPLAY_NAME}: ${msg}`);
      }
    }),
  );

}
