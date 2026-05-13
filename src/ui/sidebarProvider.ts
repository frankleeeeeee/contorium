import * as vscode from 'vscode';
import { ContoraKeyManager } from '../ai/auth/keyManager';
import { readAiRuntimeSettings } from '../ai/auth/providerConfig';
import { CONTORA_CONFIG_SECTION } from '../constants';
import { readResolvedExportTokenBudget } from '../ai/exportBudget';
import type { EventStore } from '../core/engine/eventStore';
import { getLastIntentJson } from '../ai/runtime/intent/lastIntentStore';
import { StateManager } from '../state/stateManager';
import {
  buildSidebarWebviewState,
  type SidebarAiIntentPanel,
  type SidebarByokPanelState,
} from './sidebarViewModel';

type WebviewToExt =
  | { type: 'ready' }
  | { type: 'exportAIContext' }
  | { type: 'saveStateNow' }
  | { type: 'restoreSession' }
  | { type: 'configureApiKey' }
  | { type: 'openContoraSettings' }
  | { type: 'generateSemanticSummary' }
  | { type: 'analyzeWorkspaceIntent' }
  | { type: 'compressContextPreview' }
  | { type: 'updateTask'; value: string }
  | { type: 'updateNotes'; value: string }
  | { type: 'openFile'; relativePath: string };

const TASK_MAX = 500;

export class ContoraSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'contora.sidebar';

  private view?: vscode.WebviewView;
  private folder: vscode.WorkspaceFolder | undefined;
  private events?: EventStore;
  private readonly keys: ContoraKeyManager;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly stateManager: StateManager,
    events?: EventStore,
  ) {
    this.keys = new ContoraKeyManager(ctx.secrets);
    this.events = events;
  }

  setEventStore(store: EventStore | undefined): void {
    this.events = store;
  }

  setWorkspaceFolder(folder: vscode.WorkspaceFolder | undefined): void {
    this.folder = folder;
    void this.pushStateToWebview();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.ctx.extensionUri],
    };

    // Register message handler BEFORE assigning html. If html runs first, `ready` can be
    // posted before the listener exists and the webview never receives initial state.
    webviewView.webview.onDidReceiveMessage(async (msg: WebviewToExt) => {
      if (msg.type === 'ready') {
        await this.pushStateToWebview();
        return;
      }
      if (msg.type === 'exportAIContext') {
        await vscode.commands.executeCommand('contora.exportAIContext');
        return;
      }
      if (msg.type === 'saveStateNow') {
        await vscode.commands.executeCommand('contora.saveStateNow');
        return;
      }
      if (msg.type === 'restoreSession') {
        await vscode.commands.executeCommand('contora.restoreSession');
        return;
      }
      if (msg.type === 'configureApiKey') {
        await vscode.commands.executeCommand('contora.configureApiKey');
        void this.pushStateToWebview();
        return;
      }
      if (msg.type === 'openContoraSettings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', CONTORA_CONFIG_SECTION);
        return;
      }
      if (msg.type === 'generateSemanticSummary') {
        await vscode.commands.executeCommand('contora.generateSemanticSummary');
        return;
      }
      if (msg.type === 'analyzeWorkspaceIntent') {
        await vscode.commands.executeCommand('contora.analyzeWorkspaceIntent');
        return;
      }
      if (msg.type === 'compressContextPreview') {
        await vscode.commands.executeCommand('contora.compressContextPreview');
        return;
      }
      const folder = this.folder ?? this.stateManager.getPrimaryFolder();
      if (!folder) {
        vscode.window.showWarningMessage('Contora: Open a folder workspace first.');
        return;
      }
      if (msg.type === 'updateTask') {
        const task = (msg.value ?? '').slice(0, TASK_MAX);
        await this.stateManager.update(folder, { currentTask: task });
        this.events?.add({ type: 'task_update', task, timestamp: Date.now() });
        void this.pushStateToWebview();
        return;
      }
      if (msg.type === 'updateNotes') {
        await this.stateManager.update(folder, { notes: msg.value });
        this.events?.add({ type: 'note_update', note: msg.value, timestamp: Date.now() });
        void this.pushStateToWebview();
        return;
      }
      if (msg.type === 'openFile') {
        const uri = vscode.Uri.joinPath(folder.uri, msg.relativePath);
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        } catch {
          await vscode.commands.executeCommand('vscode.open', uri);
        }
      }
    });

    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.pushStateToWebview();
      }
    });

    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  async refresh(): Promise<void> {
    await this.pushStateToWebview();
  }

  private async loadByokPanelState(): Promise<SidebarByokPanelState> {
    const cfg = vscode.workspace.getConfiguration(CONTORA_CONFIG_SECTION);
    const [kOpen, kAnth, kGoo, kDeep] = await Promise.all([
      this.keys.getKey('openai'),
      this.keys.getKey('anthropic'),
      this.keys.getKey('google'),
      this.keys.getKey('deepseek'),
    ]);
    const keyOpenAI = Boolean(kOpen?.trim());
    const keyAnthropic = Boolean(kAnth?.trim());
    const keyGoogle = Boolean(kGoo?.trim());
    const keyDeepseek = Boolean(kDeep?.trim());
    const ai = readAiRuntimeSettings();
    let activeModelId = '—';
    if (ai.aiProvider === 'openai') {
      activeModelId = ai.openaiModel;
    } else if (ai.aiProvider === 'anthropic') {
      activeModelId = ai.anthropicModel;
    } else if (ai.aiProvider === 'google') {
      activeModelId = ai.googleModel;
    } else if (ai.aiProvider === 'deepseek') {
      activeModelId = ai.deepseekModel;
    }
    const needsActiveProviderKey =
      ai.aiProvider === 'openai'
        ? !keyOpenAI
        : ai.aiProvider === 'anthropic'
          ? !keyAnthropic
          : ai.aiProvider === 'google'
            ? !keyGoogle
            : ai.aiProvider === 'deepseek'
              ? !keyDeepseek
              : false;
    return {
      aiProvider: ai.aiProvider,
      keyOpenAI,
      keyAnthropic,
      keyGoogle,
      keyDeepseek,
      activeModelId,
      exportFormat: cfg.get<string>('exportFormat') ?? 'markdown',
      exportTokenBudget: readResolvedExportTokenBudget(cfg),
      appendAiOnExport: cfg.get<boolean>('appendAiSummaryOnExport') === true,
      defaultAIMode: cfg.get<string>('defaultAIMode') ?? 'feature',
      needsActiveProviderKey,
    };
  }

  private async readAiIntentForFolder(folder: vscode.WorkspaceFolder): Promise<SidebarAiIntentPanel> {
    const empty: SidebarAiIntentPanel = { goals: [] };
    const parseRecord = (o: Record<string, unknown>): SidebarAiIntentPanel => {
      const mods = Array.isArray(o.activeModules)
        ? o.activeModules
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map((s) => s.trim())
        : [];
      const focus = typeof o.focus === 'string' && o.focus.trim() ? o.focus.trim() : '';
      let goals = mods.slice(0, 12);
      if (goals.length === 0 && focus) {
        goals = [focus];
      }
      const intentMode = typeof o.mode === 'string' && o.mode.trim() ? o.mode.trim() : undefined;
      return { goals, intentMode };
    };
    const uri = vscode.Uri.joinPath(folder.uri, '.contora', 'last-intent.json');
    try {
      const [stat, bytes] = await Promise.all([vscode.workspace.fs.stat(uri), vscode.workspace.fs.readFile(uri)]);
      const text = Buffer.from(bytes).toString('utf8');
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== 'object') {
        return empty;
      }
      const out = parseRecord(parsed as Record<string, unknown>);
      out.updatedAt = stat.mtime;
      return out;
    } catch {
      const j = getLastIntentJson();
      if (!j) {
        return empty;
      }
      try {
        const parsed = JSON.parse(j) as unknown;
        if (!parsed || typeof parsed !== 'object') {
          return empty;
        }
        const out = parseRecord(parsed as Record<string, unknown>);
        out.updatedAt = Date.now();
        return out;
      } catch {
        return empty;
      }
    }
  }

  private async pushStateToWebview(): Promise<void> {
    if (!this.view) {
      return;
    }
    const folder = this.folder ?? this.stateManager.getPrimaryFolder();
    const byok = await this.loadByokPanelState();
    if (!folder) {
      this.view.webview.postMessage({ type: 'state', state: null, byok });
      return;
    }
    const state = await this.stateManager.load(folder);
    const ver = String((this.ctx.extension.packageJSON as { version?: string }).version ?? '');
    const base = buildSidebarWebviewState(state, this.events, ver);
    const aiIntent = await this.readAiIntentForFolder(folder);
    this.view.webview.postMessage({ type: 'state', state: { ...base, aiIntent }, byok });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = String(Math.random()).slice(2);
    const cspSource = webview.cspSource;
    const csp = [
      `default-src 'none'`,
      `style-src ${cspSource} 'unsafe-inline'`,
      `font-src ${cspSource}`,
      `img-src ${cspSource} https: data:`,
      `script-src 'nonce-${nonce}' ${cspSource}`,
    ].join('; ');
    const cspAttr = csp.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    /* Inline SVGs (currentColor) — no extra assets; icons are decorative except primary actions. */
    const svg = (paths: string, w = 14, h = 14) =>
      `<svg class="cr-ico-svg" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${paths}</svg>`;
    const ico = {
      copy: svg(
        '<path d="M4 1h8v2H4V1zm-1 3h9v11H3V4zm2 2v7h5V6H5zm7-4h2v9h-2V2z"/>',
      ),
      spark: svg(
        '<path d="M8 1l1.2 3.5h3.8L10.5 7l1.5 3.5L8 8.2 4 10.5 5.5 7 2.5 4.5h3.8L8 1z"/>',
        12,
        12,
      ),
      save: svg(
        '<path d="M3 1h8l2 2v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm1 2v9h6V3H4zm2 0h2v2H6V3zm-1 7h4v2H5v-2z"/>',
      ),
      history: svg(
        '<path d="M8 3.5a4.5 4.5 0 1 0 4.32 3.25h-1.1A3.5 3.5 0 1 1 8 4.5V6l2.5-2.5L8 1v2.5z"/><path d="M7.5 5h1v3l2 1.2-.5.8-2.5-1.5V5z"/>',
      ),
      camera: svg(
        '<path d="M2 4h2l1-1h6l1 1h2a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm7 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
      ),
      target: svg(
        '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>',
      ),
      list: svg(
        '<path d="M2 3h2v2H2V3zm0 4h2v2H2V7zm0 4h2v2H2v-2zm4-8h8v2H6V3zm0 4h8v2H6V7zm0 4h8v2H6v-2z"/>',
      ),
      branch: svg(
        '<path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 1a1.5 1.5 0 0 0-1.4 2H8a2 2 0 0 0-2 1.8V11a2 2 0 1 1-2 0V9.9A3 3 0 0 1 8 7h1.6A1.5 1.5 0 1 0 11 4zM5 11a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
      ),
      clock: svg(
        '<path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1a6 6 0 1 1 0 12A6 6 0 0 1 8 2zm-.5 2h1v4.2l2.5 1.5-.5.8L7 8.2V4z"/>',
      ),
      file: svg(
        '<path d="M4 1h5l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm4 1v3h3L8 2zM5 5h6v1H5V5zm0 3h6v1H5V8zm0 3h4v1H5v-1z"/>',
      ),
      check: svg(
        '<path d="M13.5 4L6 11.5 2.5 8l1-1L6 9.5 12.5 3l1 1z"/>',
      ),
      note: svg(
        '<path d="M3 1h7l3 3v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm6 1v3h3L9 2zM5 7h6v1H5V7zm0 3h6v1H5v-1zm0 3h4v1H5v-1z"/>',
      ),
      gear: svg(
        '<path d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm4.2 4.5l1.4.8-.3 1.6-1.6.3-.8 1.4-1.5-.6-1.5.6-.8-1.4-1.6-.3-.3-1.6 1.4-.8V8l-1.4-.8.3-1.6 1.6-.3.8-1.4 1.5.6 1.5-.6.8 1.4 1.6.3.3 1.6-1.4.8V8z"/>',
      ),
      refresh: svg(
        '<path d="M8 2.5V1l2.5 2.5L8 6V4a3.5 3.5 0 1 0 3.3 4.7h1.1A4.5 4.5 0 1 1 8 2.5z"/>',
      ),
      more: svg('<path d="M4 7h1v1H4V7zm3.5 0h1v1h-1V7zm3.5 0h1v1h-1V7z"/>'),
      bell: svg(
        '<path d="M8 1a3 3 0 0 0-3 3v2.5L4 10h8l-1-3.5V4a3 3 0 0 0-3-3zm-1 11h2a1 1 0 0 1-2 0z"/>',
      ),
      code: svg(
        '<path d="M5.5 3.2L2 8l3.5 4.8h1.4L3.2 8 6.9 3.2H5.5zm5 0L14 8l-3.5 4.8H9.1L12.8 8 9.1 3.2h1.4zM9.2 3.3h1.1l-3.4 9.4H5.8l3.4-9.4z"/>',
      ),
      plus: svg('<path d="M8 3v5h5v1H8v5H7V9H2V8h5V3h1z"/>', 12, 12),
      jumpDown: svg('<path d="M8 11.5L3.5 7h9L8 11.5zm0 2L3.5 9h9l-4.5 4.5z"/>', 14, 14),
    };
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${cspAttr}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Contora</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground, #cccccc);
      background-color: var(--vscode-sideBar-background, #252526);
      padding: 8px 10px 14px;
      margin: 0;
      line-height: 1.4;
    }
    .cr-ico-svg { display: block; flex-shrink: 0; opacity: 0.92; }
    .cr-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.22));
    }
    .cr-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      letter-spacing: 0.08em;
      font-size: 11px;
      color: var(--vscode-sideBarTitle-foreground, var(--vscode-foreground));
    }
    .cr-logo {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid var(--vscode-focusBorder, var(--vscode-foreground));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      background: linear-gradient(145deg, var(--vscode-button-background), var(--vscode-button-hoverBackground));
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
    .cr-header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .cr-icon-pill {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      color: var(--vscode-foreground);
      opacity: 0.72;
    }
    .cr-icon-pill:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
    .cr-ai-card {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,.1));
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.2));
      border-radius: 10px;
      padding: 10px 10px 8px;
      margin-bottom: 12px;
    }
    .cr-ai-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .cr-ai-card-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--vscode-foreground);
    }
    .cr-ai-card-title .cr-ico-svg { width: 14px; height: 14px; opacity: 0.9; }
    .cr-ai-card-status {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }
    .cr-ai-card-status .cr-dot { background: var(--vscode-testing-iconPassed, #3fb950); }
    .cr-ai-card-status.cr-ai-card-status--busy .cr-dot--pulse {
      animation: none;
      opacity: 1;
    }
    .cr-dot--pulse {
      animation: cr-dot-pulse 1.6s ease-in-out infinite;
    }
    @keyframes cr-dot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(0.88); }
    }
    /* Recent activity row: gentle clock pulse while the live feed has items */
    .cr-sum-ico--clock.cr-sum-ico--pulse-soft {
      animation: cr-clock-soft 2.6s ease-in-out infinite;
    }
    @keyframes cr-clock-soft {
      0%, 100% { opacity: 0.75; }
      50% { opacity: 1; filter: brightness(1.2); }
    }
    .cr-ai-focus-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .cr-ai-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }
    .cr-ai-goals-label {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      margin: 10px 0 4px;
    }
    ul.cr-ai-goals-list {
      margin: 0;
      padding: 0 0 0 16px;
      font-size: 12px;
      line-height: 1.45;
      color: var(--vscode-foreground);
    }
    ul.cr-ai-goals-list li { margin: 2px 0; }
    ul.cr-ai-goals-list li.cr-goal-enter {
      animation: cr-goal-in 0.42s ease-out both;
    }
    @keyframes cr-goal-in {
      from { opacity: 0; transform: translateX(-6px); }
      to { opacity: 1; transform: translateX(0); }
    }
    ul.cr-activity-feed {
      list-style: none;
      margin: 4px 0 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground);
    }
    ul.cr-activity-feed li.cr-activity-feed-row {
      margin: 0;
      padding: 3px 0 3px 2px;
      border-radius: 3px;
    }
    ul.cr-activity-feed li.cr-activity-feed-enter {
      animation: cr-activity-feed-in 0.42s ease-out both;
    }
    @keyframes cr-activity-feed-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    ul.cr-activity-feed li.cr-activity-feed-row--flash {
      animation: cr-activity-feed-flash 1s ease-out;
    }
    @keyframes cr-activity-feed-flash {
      0% {
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.22));
      }
      100% {
        color: var(--vscode-descriptionForeground);
        background-color: transparent;
      }
    }
    .cr-ai-goals-empty {
      margin: 4px 0 0;
      font-size: 11px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground);
    }
    .cr-ai-goals-empty.cr-text-shimmer {
      position: relative;
      overflow: hidden;
    }
    button.cr-ai-goals-toggle {
      display: block;
      margin: 6px 0 0;
      padding: 0;
      border: none;
      background: transparent;
      font-family: inherit;
      font-size: 11px;
      line-height: 1.35;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-align: left;
    }
    button.cr-ai-goals-toggle:hover {
      text-decoration: underline;
    }
    button.cr-ai-goals-toggle:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    .cr-ai-goals-empty.cr-text-shimmer::after {
      content: '';
      position: absolute;
      inset: 0;
      width: 55%;
      background: linear-gradient(
        105deg,
        transparent 0%,
        var(--vscode-scrollbarSlider-hoverBackground, rgba(127, 127, 127, 0.35)) 50%,
        transparent 100%
      );
      opacity: 0.55;
      animation: cr-shimmer-sweep 2.1s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes cr-shimmer-sweep {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(220%); }
    }
    .cr-ai-card-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .cr-ai-side-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr auto;
      gap: 6px;
      align-items: end;
      padding-top: 8px;
      margin-top: 4px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.15));
    }
    .cr-ai-jump-byok {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      margin-bottom: 1px;
      padding: 0;
      flex-shrink: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
    }
    .cr-ai-jump-byok:hover {
      color: var(--vscode-textLink-foreground);
      background: var(--vscode-toolbar-hoverBackground);
    }
    .cr-ai-jump-byok:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .cr-ai-jump-byok .cr-ico-svg { width: 14px; height: 14px; opacity: 0.88; }
    .cr-ai-side-cell {
      min-width: 0;
      font-size: 10px;
      line-height: 1.35;
    }
    .cr-ai-side-k {
      display: block;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }
    .cr-ai-side-v {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
      word-break: break-word;
    }
    .cr-ai-side-v .cr-ai-byok-muted { font-weight: 500; color: var(--vscode-descriptionForeground); }
    .cr-ai-side-mode { color: var(--vscode-symbolIcon-arrayForeground, #c586c0); font-weight: 600; }
    .cr-badge-pro {
      display: inline-block;
      margin-left: 4px;
      padding: 0 5px;
      font-size: 9px;
      font-weight: 700;
      vertical-align: middle;
      border-radius: 3px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    .cr-ai-card-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.15));
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .cr-ai-foot-ctx { color: var(--vscode-textLink-foreground); cursor: default; }
    .cr-actions { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
    button.cr-primary {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 12px;
      font-size: var(--vscode-font-size);
      font-weight: 600;
      font-family: var(--vscode-font-family);
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 1px 0 rgba(0,0,0,.12);
    }
    button.cr-primary:hover { background: var(--vscode-button-hoverBackground); }
    button.cr-primary .cr-ico-svg { opacity: 1; }
    .cr-grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    button.cr-secondary, button.cr-tertiary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: var(--vscode-font-family);
    }
    button.cr-secondary {
      padding: 8px 8px;
      font-size: 12px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 6px;
      cursor: pointer;
    }
    button.cr-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.cr-tertiary {
      padding: 7px 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-input-background, transparent);
      border: 1px dashed var(--vscode-widget-border, rgba(127,127,127,.4));
      border-radius: 6px;
      cursor: pointer;
    }
    button.cr-tertiary:hover {
      color: var(--vscode-foreground);
      background: var(--vscode-toolbar-hoverBackground);
    }
    .cr-section {
      margin-top: 14px;
      padding-top: 2px;
    }
    .cr-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-descriptionForeground));
      margin: 0 0 6px;
      text-transform: uppercase;
    }
    .cr-section-head .cr-sec-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .cr-section-head .cr-sec-ico {
      display: flex;
      color: var(--vscode-descriptionForeground);
      opacity: 0.95;
    }
    .cr-section-head .cr-sec-ico .cr-ico-svg { width: 13px; height: 13px; }
    .cr-link-quiet {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: none;
      color: var(--vscode-textLink-foreground);
      cursor: default;
      opacity: 0.85;
    }
    .cr-task-meta { font-weight: 500; letter-spacing: 0.02em; font-size: 11px; color: var(--vscode-descriptionForeground); }
    textarea, input {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    textarea#task.cr-task-input {
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px dashed var(--vscode-widget-border, rgba(127,127,127,.4));
      border-radius: 6px;
      box-shadow: none;
      font-size: 12px;
      padding: 5px 8px;
      min-height: 34px;
      max-height: 100px;
      resize: vertical;
      line-height: 1.4;
      opacity: 0.95;
      transition: border-color 0.12s ease, background 0.12s ease, opacity 0.12s ease;
    }
    textarea#task.cr-task-input::placeholder {
      color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
      opacity: 0.75;
    }
    textarea#task.cr-task-input:hover {
      opacity: 1;
      background: var(--vscode-input-background, rgba(127,127,127,.06));
      border-color: var(--vscode-input-border, rgba(127,127,127,.45));
      border-style: solid;
    }
    textarea#task.cr-task-input:focus {
      opacity: 1;
      outline: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-focusBorder, var(--vscode-input-border));
      border-style: solid;
    }
    textarea#notes { min-height: 68px; resize: vertical; margin-top: 2px; }
    .cr-summary {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,.08));
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.18));
      border-radius: 8px;
      padding: 8px 8px 8px 6px;
    }
    .cr-sum-line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: 12px;
      margin: 0;
      padding: 6px 4px;
      border-radius: 4px;
    }
    .cr-sum-line + .cr-sum-line { border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.12)); }
    .cr-sum-ico {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      margin-top: 1px;
    }
    .cr-sum-ico--files { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); background: rgba(115,201,145,.12); }
    .cr-sum-ico--git { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); background: rgba(226,192,141,.12); }
    .cr-sum-ico--clock { color: var(--vscode-gitDecoration-untrackedResourceForeground, #75beff); background: rgba(117,190,255,.12); }
    .cr-sum-main { min-width: 0; flex: 1; }
    .cr-sum-muted { color: var(--vscode-descriptionForeground); font-size: 11px; display: block; margin-bottom: 2px; }
    .cr-sum-body { color: var(--vscode-foreground); font-size: 12px; line-height: 1.35; }
    #sumGitBody.cr-sum-body--anim {
      display: inline-block;
      transform-origin: left center;
      animation: cr-num-pop 0.48s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes cr-num-pop {
      0% { transform: scale(1); }
      40% { transform: scale(1.045); }
      100% { transform: scale(1); }
    }
    #sumActivity.cr-sum-line--flash .cr-sum-body {
      animation: cr-activity-flash 1s ease-out;
    }
    @keyframes cr-activity-flash {
      0% {
        background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.22));
        border-radius: 4px;
      }
      100% { background-color: transparent; }
    }
    #sumActiveBody.cr-sum-body--anim {
      display: inline-block;
      transform-origin: left center;
      animation: cr-num-pop 0.48s cubic-bezier(0.22, 1, 0.36, 1);
    }
    ul.cr-file-list { padding: 4px 0 0; margin: 0; list-style: none; }
    li.file-row {
      cursor: pointer;
      margin: 0;
      padding: 5px 6px;
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
      word-break: break-all;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      border-radius: 4px;
    }
    li.file-row:hover { background: var(--vscode-list-hoverBackground); text-decoration: none; }
    li.file-row.cr-row-enter {
      animation: cr-row-in 0.38s ease-out both;
    }
    @keyframes cr-row-in {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    li.file-row.cr-file-row--flash {
      animation: cr-file-row-flash 1s ease-out;
    }
    @keyframes cr-file-row-flash {
      0% { background-color: var(--vscode-editor-inactiveSelectionBackground, rgba(127, 127, 127, 0.28)); }
      100% { background-color: transparent; }
    }
    li.file-row .cr-file-text { text-decoration: none; }
    li.file-row:hover .cr-file-text { text-decoration: underline; }
    li.file-row .cr-file-ico { flex-shrink: 0; margin-top: 1px; color: var(--vscode-symbolIcon-fileForeground, var(--vscode-descriptionForeground)); opacity: 0.9; }
    li.muted-row {
      font-size: 12px;
      color: var(--vscode-disabledForeground);
      padding: 6px 6px;
      cursor: default;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    li.toggle-more {
      list-style: none;
      margin-top: 4px;
      padding: 4px 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
    }
    li.toggle-more:hover { text-decoration: underline; }
    details.cr-git {
      margin-top: 12px;
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.18));
      border-radius: 8px;
      padding: 2px 8px 8px;
      background: var(--vscode-sideBarSectionHeader-background, transparent);
    }
    details.cr-git > summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-descriptionForeground));
      text-transform: uppercase;
      padding: 8px 4px;
      margin: 0 -4px;
      border-radius: 4px;
    }
    details.cr-git > summary::-webkit-details-marker { display: none; }
    details.cr-git > summary::before {
      content: '';
      width: 0; height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid currentColor;
      opacity: 0.75;
      transform: rotate(-90deg);
      transition: transform 0.12s ease;
    }
    details.cr-git[open] > summary::before { transform: rotate(0deg); }
    .cr-git-sub { margin: 4px 0 8px; }
    .cr-git-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin: 8px 0 4px;
    }
    .cr-git-label .cr-git-ico { display: flex; opacity: 0.9; }
    .cr-notes-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 14px;
      margin-bottom: 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }
    .cr-notes-label .cr-sec-ico { display: flex; }
    footer.cr-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25));
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .cr-local {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cr-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--vscode-testing-iconPassed, #3fb950);
      flex-shrink: 0;
    }
    .cr-footer-gear { display: flex; color: var(--vscode-descriptionForeground); opacity: 0.85; cursor: pointer; }
    .cr-footer-gear:hover { color: var(--vscode-textLink-foreground); opacity: 1; }
    .cr-byok {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(127,127,127,.08));
      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.18));
      border-radius: 8px;
      padding: 8px 10px 10px;
    }
    .cr-byok-line { margin: 0 0 6px; font-size: 12px; line-height: 1.35; color: var(--vscode-foreground); }
    .cr-byok-muted { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .cr-byok-warn {
      margin: 8px 0 0;
      padding: 6px 8px;
      font-size: 11px;
      border-radius: 6px;
      color: var(--vscode-inputValidation-warningForeground);
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-inputValidation-warningBorder, transparent);
    }
    #crByokSection { scroll-margin-top: 10px; }

    /* Phased restore (§7): hide sections without layout change; reveal uses opacity only. */
    html.cr-restore-hydrating .cr-sum-line.cr-restore-hidden,
    html.cr-restore-hydrating #crSecRecent.cr-restore-hidden,
    html.cr-restore-hydrating #crGitDetails.cr-restore-hidden,
    html.cr-restore-hydrating #crSecAiGoals.cr-restore-hidden {
      transition: none !important;
    }
    .cr-sum-line,
    #crSecRecent,
    #crGitDetails,
    #crSecAiGoals {
      transition: opacity 0.42s ease-out;
    }
    .cr-sum-line.cr-restore-hidden,
    #crSecRecent.cr-restore-hidden,
    #crGitDetails.cr-restore-hidden,
    #crSecAiGoals.cr-restore-hidden {
      opacity: 0;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <header class="cr-header">
    <div class="cr-brand"><span class="cr-logo">C</span> CONTORA</div>
    <div class="cr-header-actions" aria-hidden="true">
      <span class="cr-icon-pill" title="Decorative">${ico.refresh}</span>
      <span class="cr-icon-pill" title="Decorative">${ico.more}</span>
      <span class="cr-icon-pill" title="Decorative">${ico.bell}</span>
    </div>
  </header>

  <section class="cr-ai-card" aria-label="Workspace status">
    <div class="cr-ai-card-head">
      <span class="cr-ai-card-title">${ico.code} Workspace status</span>
      <span class="cr-ai-card-status" id="aiCardStatusRow"><span class="cr-dot cr-dot--pulse"></span><span id="aiTrackStatus">Workspace tracking active</span></span>
    </div>
    <div class="cr-ai-card-grid">
      <div>
        <div class="cr-ai-focus-row">
          <span class="cr-ai-label">Current focus</span>
          <span class="cr-task-meta" style="display:flex;align-items:center;gap:6px">
            <span class="cr-sec-ico" style="opacity:.45" aria-hidden="true" title="Keywords from text">${ico.plus}</span>
            <span id="taskCount">0 / ${TASK_MAX}</span>
          </span>
        </div>
        <textarea id="task" class="cr-task-input" rows="2" maxlength="${TASK_MAX}" placeholder="What you are focused on right now (optional; also informed by workspace activity)."></textarea>
        <p id="taskActivityHint" class="cr-byok-muted">Updated automatically from recent work</p>
        <div id="crSecAiGoals">
        <p class="cr-ai-goals-label">Operational intent</p>
        <ul id="aiIntentGoals" class="cr-ai-goals-list" hidden></ul>
        <button type="button" id="aiIntentGoalsToggle" class="cr-ai-goals-toggle" hidden aria-expanded="false"></button>
        <p id="aiIntentEmpty" class="cr-ai-goals-empty cr-text-shimmer">Inferring what you are working on from edits, saves, and Git signals — or run &quot;Learn workspace intent&quot; for a structured AI snapshot.</p>
        </div>
      </div>
      <div class="cr-ai-side-strip" aria-label="Model and runtime summary">
        <div class="cr-ai-side-cell">
          <span class="cr-ai-side-k">Model</span>
          <span class="cr-ai-side-v"><span id="aiStatModel">—</span><span class="cr-badge-pro" id="aiStatTierBadge" hidden>Pro</span></span>
        </div>
        <div class="cr-ai-side-cell">
          <span class="cr-ai-side-k">Runtime</span>
          <span class="cr-ai-side-v" id="aiStatRuntime">—</span>
        </div>
        <div class="cr-ai-side-cell">
          <span class="cr-ai-side-k">Mode</span>
          <span class="cr-ai-side-v cr-ai-side-mode" id="aiStatMode">—</span>
        </div>
        <button type="button" class="cr-ai-jump-byok" id="btnJumpByok" title="Scroll to BYOK / Cloud AI (v3)" aria-label="Scroll to BYOK / Cloud AI">${ico.jumpDown}</button>
      </div>
      <div class="cr-ai-card-foot">
        <span id="aiStatUpdated">—</span>
        <span id="aiStatCtx" class="cr-ai-foot-ctx">—</span>
      </div>
    </div>
  </section>

  <div class="cr-actions">
    <button type="button" class="cr-primary" id="btnExport" title="Copy a compact, AI-ready snapshot (no raw telemetry) to the clipboard">
      ${ico.copy}<span>Copy AI-ready context</span>${ico.spark}
    </button>
    <div class="cr-grid2">
      <button type="button" class="cr-secondary" id="btnSave" title="Write state to disk">${ico.save}<span>Sync state to disk</span></button>
      <button type="button" class="cr-secondary" id="btnRestore" title="Reopen editors from last saved state">${ico.history}<span>Restore editors</span></button>
    </div>
  </div>

  <section class="cr-section" id="crSecSnapshot">
    <div class="cr-section-head">
      <span class="cr-sec-left"><span class="cr-sec-ico">${ico.spark}</span><span>Workspace snapshot</span></span>
    </div>
    <div class="cr-summary">
      <div class="cr-sum-line" id="sumActive">
        <span class="cr-sum-ico cr-sum-ico--files">${ico.list}</span>
        <div class="cr-sum-main">
          <span class="cr-sum-muted">Active files</span>
          <div class="cr-sum-body" id="sumActiveBody">—</div>
        </div>
      </div>
      <div class="cr-sum-line" id="sumGit">
        <span class="cr-sum-ico cr-sum-ico--git">${ico.branch}</span>
        <div class="cr-sum-main">
          <span class="cr-sum-muted">Git sync</span>
          <div class="cr-sum-body" id="sumGitBody">—</div>
        </div>
      </div>
      <div class="cr-sum-line" id="sumActivity">
        <span class="cr-sum-ico cr-sum-ico--clock">${ico.clock}</span>
        <div class="cr-sum-main">
          <span class="cr-sum-muted">Recent activity</span>
          <div class="cr-sum-body" id="sumActivityBody">—</div>
          <ul id="activityStreamList" class="cr-activity-feed" hidden aria-label="Recent workspace activity"></ul>
        </div>
      </div>
    </div>
  </section>

  <section class="cr-section" id="crSecRecent">
    <div class="cr-section-head">
      <span class="cr-sec-left"><span class="cr-sec-ico">${ico.file}</span><span>Active files</span></span>
    </div>
    <ul id="recent" class="cr-file-list"></ul>
  </section>

  <details class="cr-git" open id="crGitDetails">
    <summary><span class="cr-sec-ico" style="margin-right:2px">${ico.branch}</span> Git changes (synced)</summary>
    <div class="cr-git-sub">
      <div class="cr-git-label"><span class="cr-git-ico">${ico.check}</span> Staged</div>
      <ul id="gitStaged" class="cr-file-list"></ul>
    </div>
    <div class="cr-git-sub">
      <div class="cr-git-label"><span class="cr-git-ico">${ico.history}</span> Unstaged</div>
      <ul id="gitWorking" class="cr-file-list"></ul>
    </div>
  </details>

  <label class="cr-notes-label" for="notes"><span class="cr-sec-ico">${ico.note}</span> Context notes</label>
  <textarea id="notes" rows="4" placeholder="Notes for export — kept locally in workspace state."></textarea>

  <section class="cr-section" id="crByokSection" style="margin-top:16px">
    <div class="cr-section-head">
      <span class="cr-sec-left"><span class="cr-sec-ico">${ico.gear}</span><span>BYOK / Cloud AI (v3)</span></span>
    </div>
    <div class="cr-byok">
      <p class="cr-byok-line cr-byok-muted" id="byokRuntime">—</p>
      <p class="cr-byok-line" id="byokProvider">—</p>
      <p class="cr-byok-line cr-byok-muted" id="byokKeys">—</p>
      <p class="cr-byok-line cr-byok-muted" id="byokModel">—</p>
      <p class="cr-byok-line cr-byok-muted" id="byokExport">—</p>
      <p class="cr-byok-warn" id="byokWarn" hidden>Set <code>contora.aiProvider</code> and save the vendor API key in SecretStorage (never in <code>settings.json</code>).</p>
      <div class="cr-grid2" style="margin-top:10px">
        <button type="button" class="cr-secondary" id="btnByokKey" title="OpenAI / Anthropic / Gemini / DeepSeek">${ico.gear}<span>Configure API key…</span></button>
        <button type="button" class="cr-secondary" id="btnByokSettings" title="Models, export format, token budget…">${ico.spark}<span>Contora settings</span></button>
      </div>
      <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
        <button type="button" class="cr-tertiary" id="btnAiSemantic">Observe workspace (AI summary)</button>
        <button type="button" class="cr-tertiary" id="btnAiIntent">Learn workspace intent (AI)</button>
        <button type="button" class="cr-tertiary" id="btnAiCompress">Tighten context preview (AI)</button>
      </div>
    </div>
  </section>

  <footer class="cr-footer">
    <span id="crVersion">Contora</span>
    <span class="cr-local">
      <span class="cr-dot" title="Session data stays on this machine"></span> Local data only
      <span class="cr-footer-gear" id="btnFooterSettings" role="button" tabindex="0" title="Open Contora settings">${ico.gear}</span>
    </span>
  </footer>

  <template id="tpl-file-ico">${ico.file}</template>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const TASK_MAX = ${TASK_MAX};
    const taskEl = document.getElementById('task');
    const notesEl = document.getElementById('notes');
    const taskCountEl = document.getElementById('taskCount');
    const recentEl = document.getElementById('recent');
    const gitStagedEl = document.getElementById('gitStaged');
    const gitWorkingEl = document.getElementById('gitWorking');
    const sumActiveBody = document.getElementById('sumActiveBody');
    const sumGitBody = document.getElementById('sumGitBody');
    const sumActivityBody = document.getElementById('sumActivityBody');
    const sumActivityLine = document.getElementById('sumActivity');
    const activityStreamListEl = document.getElementById('activityStreamList');
    const crVersion = document.getElementById('crVersion');
    const byokRuntime = document.getElementById('byokRuntime');
    const byokProvider = document.getElementById('byokProvider');
    const byokKeys = document.getElementById('byokKeys');
    const byokModel = document.getElementById('byokModel');
    const byokExport = document.getElementById('byokExport');
    const byokWarn = document.getElementById('byokWarn');
    const aiIntentGoalsEl = document.getElementById('aiIntentGoals');
    const aiIntentEmptyEl = document.getElementById('aiIntentEmpty');
    const aiIntentGoalsToggle = document.getElementById('aiIntentGoalsToggle');
    const LIST_PREVIEW = 5;
    let aiGoalsExpanded = false;
    const aiStatModel = document.getElementById('aiStatModel');
    const aiStatRuntime = document.getElementById('aiStatRuntime');
    const aiStatMode = document.getElementById('aiStatMode');
    const aiStatUpdated = document.getElementById('aiStatUpdated');
    const aiStatCtx = document.getElementById('aiStatCtx');
    const aiStatTierBadge = document.getElementById('aiStatTierBadge');
    const aiTrackStatus = document.getElementById('aiTrackStatus');
    let lastTrackFingerprint = '';
    let lastActivityStreamHead = '';
    let trackStatusTimer = null;
    const _tplIco = document.getElementById('tpl-file-ico');
    const fileIcoHtml = _tplIco ? _tplIco.innerHTML : '';

    function escapeHtml(t) {
      return String(t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    let debounce;
    function debouncePost(type, value) {
      clearTimeout(debounce);
      debounce = setTimeout(() => vscode.postMessage({ type, value }), 400);
    }

    function paintTaskMeta() {
      const n = taskEl.value.length;
      taskCountEl.textContent = n + ' / ' + TASK_MAX;
    }

    taskEl.addEventListener('input', () => {
      paintTaskMeta();
      debouncePost('updateTask', taskEl.value);
    });
    notesEl.addEventListener('input', () => debouncePost('updateNotes', notesEl.value));

    document.getElementById('btnExport').addEventListener('click', () => vscode.postMessage({ type: 'exportAIContext' }));
    document.getElementById('btnSave').addEventListener('click', () => vscode.postMessage({ type: 'saveStateNow' }));
    document.getElementById('btnRestore').addEventListener('click', () => vscode.postMessage({ type: 'restoreSession' }));
    const btnJumpByok = document.getElementById('btnJumpByok');
    if (btnJumpByok) {
      btnJumpByok.addEventListener('click', () => {
        const el = document.getElementById('crByokSection');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    if (aiIntentGoalsToggle) {
      aiIntentGoalsToggle.addEventListener('click', function () {
        aiGoalsExpanded = !aiGoalsExpanded;
        if (lastState) {
          paintAiIntentPanel(lastState.aiIntent || null, lastState.activityObservedGoals || []);
        } else {
          paintAiIntentPanel(null, []);
        }
      });
    }

    const expandState = { recent: false, staged: false, working: false, activityStream: false };
    let lastState = null;
    let lastRecentTop = '';
    let lastSumGit = '';
    let lastSumActive = '';
    let lastSumActivity = '';

    function fingerprintSidebar(s) {
      if (!s) return '';
      return JSON.stringify({
        summary: s.summary,
        recentFiles: s.recentFiles,
        recentSuffix: s.recentFileActivitySuffixes,
        gitStaged: s.gitStaged,
        gitWorking: s.gitWorking,
        goals: (s.aiIntent && s.aiIntent.goals) || [],
        activityGoals: s.activityObservedGoals || [],
        activityStream: s.activityStreamItems || [],
      });
    }

    function bumpTrackStatus(s) {
      if (!aiTrackStatus) return;
      const statusRow = document.getElementById('aiCardStatusRow');
      if (!s) {
        if (trackStatusTimer) {
          clearTimeout(trackStatusTimer);
          trackStatusTimer = null;
        }
        if (statusRow) statusRow.classList.remove('cr-ai-card-status--busy');
        aiTrackStatus.textContent = 'Workspace tracking active';
        lastTrackFingerprint = '';
        return;
      }
      const fp = fingerprintSidebar(s);
      if (lastTrackFingerprint && fp !== lastTrackFingerprint) {
        aiTrackStatus.textContent = 'Syncing workspace…';
        if (statusRow) statusRow.classList.add('cr-ai-card-status--busy');
        if (trackStatusTimer) clearTimeout(trackStatusTimer);
        trackStatusTimer = setTimeout(function () {
          aiTrackStatus.textContent = 'Workspace tracking active';
          if (statusRow) statusRow.classList.remove('cr-ai-card-status--busy');
          trackStatusTimer = null;
        }, 1000);
      }
      lastTrackFingerprint = fp;
    }

    function renderCollapsibleList(ul, items, sectionKey, itemSuffixes) {
      ul.innerHTML = '';
      if (!items || items.length === 0) {
        const li = document.createElement('li');
        li.className = 'muted-row';
        li.textContent = sectionKey === 'recent' ? 'No paths tracked yet' : '(nothing listed yet)';
        ul.appendChild(li);
        if (sectionKey === 'recent') {
          lastRecentTop = '';
        }
        return;
      }
      const expanded = expandState[sectionKey];
      const lim = expanded ? items.length : Math.min(items.length, LIST_PREVIEW);
      for (let i = 0; i < lim; i++) {
        const p = items[i];
        let textHtml = escapeHtml(p);
        if (sectionKey === 'recent' && itemSuffixes && itemSuffixes[i]) {
          textHtml += ' · ' + escapeHtml(itemSuffixes[i]);
        }
        const li = document.createElement('li');
        li.className = 'file-row cr-row-enter';
        li.style.animationDelay = Math.min(i, 10) * 55 + 'ms';
        if (sectionKey === 'recent' && i === 0 && lastRecentTop && lastRecentTop !== p) {
          li.classList.add('cr-file-row--flash');
        }
        li.innerHTML = '<span class="cr-file-ico">' + fileIcoHtml + '</span><span class="cr-file-text">' + textHtml + '</span>';
        li.addEventListener('click', () => vscode.postMessage({ type: 'openFile', relativePath: p }));
        ul.appendChild(li);
      }
      if (items.length > LIST_PREVIEW) {
        const toggle = document.createElement('li');
        toggle.className = 'toggle-more';
        toggle.textContent = expanded ? 'Show less' : 'More (+' + (items.length - LIST_PREVIEW) + ')';
        toggle.addEventListener('click', (e) => {
          e.preventDefault();
          expandState[sectionKey] = !expandState[sectionKey];
          if (lastState) paintLists(lastState);
        });
        ul.appendChild(toggle);
      }
      if (sectionKey === 'recent' && items.length) {
        lastRecentTop = items[0];
      }
    }

    function paintByok(b) {
      if (!byokProvider || !byokKeys || !byokModel || !byokExport || !byokWarn) return;
      if (!byokRuntime) return;
      if (!b) {
        byokRuntime.textContent = '—';
        byokProvider.textContent = '—';
        byokKeys.textContent = '—';
        byokModel.textContent = '—';
        byokExport.textContent = '—';
        byokWarn.hidden = true;
        return;
      }
      byokRuntime.textContent = 'Runtime: Contora (@contora/runtime)';
      const labels = {
        off: 'Off (observing locally only)',
        openai: 'OpenAI',
        anthropic: 'Anthropic (Claude)',
        google: 'Google Gemini',
        deepseek: 'DeepSeek',
      };
      byokProvider.textContent = 'Provider: ' + (labels[b.aiProvider] || b.aiProvider);
      function mark(name, ok) {
        return name + (ok ? ' ✓' : ' —');
      }
      byokKeys.textContent =
        'Keys: ' +
        mark('OpenAI', b.keyOpenAI) +
        ' · ' +
        mark('Claude', b.keyAnthropic) +
        ' · ' +
        mark('Gemini', b.keyGoogle) +
        ' · ' +
        mark('DeepSeek', b.keyDeepseek);
      byokModel.textContent =
        b.aiProvider === 'off' ? 'Model: (BYOK off)' : 'Model: ' + (b.activeModelId || '—');
      const budgetTxt =
        !b.exportTokenBudget ? 'Unlimited' : String(b.exportTokenBudget) + ' tokens';
      byokExport.textContent =
        'Export: ' +
        (b.exportFormat || 'markdown') +
        ' · budget ' +
        budgetTxt +
        ' · append AI on export: ' +
        (b.appendAiOnExport ? 'on' : 'off') +
        ' · default mode: ' +
        (b.defaultAIMode || 'feature');
      byokWarn.hidden = !b.needsActiveProviderKey;
    }

    function formatIntentUpdated(ts) {
      if (ts == null || !Number.isFinite(ts)) {
        return 'Sync time unknown';
      }
      const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
      if (mins === 0) {
        return 'Goals synced just now';
      }
      if (mins < 60) {
        return 'Goals synced ' + mins + ' min ago';
      }
      const h = Math.floor(mins / 60);
      return 'Goals synced ' + h + ' h ago';
    }

    function paintAiIntentPanel(aiIntent, activityGoals) {
      if (!aiIntentGoalsEl || !aiIntentEmptyEl) {
        return;
      }
      function dedupeConsecutiveLines(arr) {
        if (!arr || !arr.length) {
          return [];
        }
        const out = [];
        for (let i = 0; i < arr.length; i++) {
          const g = arr[i];
          if (out.length && out[out.length - 1] === g) {
            continue;
          }
          out.push(g);
        }
        return out;
      }
      const fromAi = !!(aiIntent && aiIntent.goals && aiIntent.goals.length > 0);
      const ag = activityGoals || [];
      const goals = dedupeConsecutiveLines(fromAi ? aiIntent.goals : ag);
      aiIntentGoalsEl.innerHTML = '';
      if (goals.length <= LIST_PREVIEW) {
        aiGoalsExpanded = false;
      }
      const showAll = goals.length <= LIST_PREVIEW || aiGoalsExpanded;
      const visibleGoals = showAll ? goals : goals.slice(0, LIST_PREVIEW);
      if (goals.length === 0) {
        aiIntentGoalsEl.hidden = true;
        aiIntentEmptyEl.hidden = false;
        if (aiIntentGoalsToggle) {
          aiIntentGoalsToggle.hidden = true;
        }
      } else {
        aiIntentEmptyEl.hidden = true;
        aiIntentGoalsEl.hidden = false;
        for (let gi = 0; gi < visibleGoals.length; gi++) {
          const g = visibleGoals[gi];
          const li = document.createElement('li');
          li.className = 'cr-goal-enter';
          li.style.animationDelay = Math.min(gi, 12) * 500 + 'ms';
          li.textContent = g;
          aiIntentGoalsEl.appendChild(li);
        }
        if (aiIntentGoalsToggle) {
          if (goals.length > LIST_PREVIEW) {
            aiIntentGoalsToggle.hidden = false;
            aiIntentGoalsToggle.textContent = aiGoalsExpanded
              ? 'Show less'
              : 'More (+' + (goals.length - LIST_PREVIEW) + ')';
            aiIntentGoalsToggle.setAttribute('aria-expanded', aiGoalsExpanded ? 'true' : 'false');
          } else {
            aiIntentGoalsToggle.hidden = true;
          }
        }
      }
      if (aiStatUpdated) {
        if (fromAi) {
          aiStatUpdated.textContent = formatIntentUpdated(aiIntent.updatedAt);
        } else if (goals.length > 0) {
          aiStatUpdated.textContent = 'Live intent from workspace activity';
        } else {
          aiStatUpdated.textContent = 'Inferring operational intent…';
        }
      }
    }

    function paintAiRibbon(b, aiIntent, activityGoals) {
      if (!aiStatModel || !aiStatRuntime || !aiStatMode || !aiStatCtx || !aiStatTierBadge) {
        return;
      }
      paintAiIntentPanel(aiIntent, activityGoals);
      if (!b) {
        aiStatModel.textContent = '—';
        aiStatTierBadge.hidden = true;
        aiStatRuntime.textContent = '—';
        aiStatMode.textContent = '—';
        aiStatCtx.textContent = 'Export token budget —';
        return;
      }
      aiStatModel.textContent = b.aiProvider === 'off' ? '(cloud off)' : b.activeModelId || '—';
      aiStatTierBadge.hidden = true;
      if (b.aiProvider === 'off') {
        aiStatRuntime.textContent = 'Local heuristics';
      } else {
        aiStatRuntime.innerHTML =
          'Cloud AI (v3)<span class="cr-ai-byok-muted"> BYOK</span>';
      }
      const fromAi = !!(aiIntent && aiIntent.goals && aiIntent.goals.length > 0);
      const modeFromIntent = fromAi && aiIntent ? aiIntent.intentMode : undefined;
      aiStatMode.textContent = modeFromIntent || b.defaultAIMode || 'feature';
      const budgetTxt =
        !b.exportTokenBudget ? 'no cap' : String(b.exportTokenBudget) + ' tokens';
      aiStatCtx.textContent = 'Context ' + budgetTxt;
    }

    function wireClick(el, type) {
      if (!el) return;
      el.addEventListener('click', function () { vscode.postMessage({ type: type }); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vscode.postMessage({ type: type }); }
      });
    }

    function paintActivityStream(items, silent) {
      if (!activityStreamListEl) {
        return;
      }
      const clockIco = document.querySelector('#sumActivity .cr-sum-ico--clock');
      const list = items && items.length ? items : [];
      if (list.length === 0) {
        activityStreamListEl.innerHTML = '';
        activityStreamListEl.hidden = true;
        lastActivityStreamHead = '';
        expandState.activityStream = false;
        if (clockIco) {
          clockIco.classList.remove('cr-sum-ico--pulse-soft');
        }
        return;
      }
      if (list.length <= LIST_PREVIEW) {
        expandState.activityStream = false;
      }
      const prevHead = lastActivityStreamHead;
      activityStreamListEl.hidden = false;
      activityStreamListEl.innerHTML = '';
      if (clockIco) {
        clockIco.classList.add('cr-sum-ico--pulse-soft');
      }
      const streamExpanded = expandState.activityStream;
      const lim = streamExpanded ? list.length : Math.min(list.length, LIST_PREVIEW);
      for (let i = 0; i < lim; i++) {
        const li = document.createElement('li');
        li.className = 'cr-activity-feed-row';
        li.textContent = list[i];
        const newHead = i === 0 && list[0] && !silent && list[0] !== prevHead;
        if (newHead) {
          li.classList.add('cr-activity-feed-enter', 'cr-activity-feed-row--flash');
        }
        activityStreamListEl.appendChild(li);
      }
      if (list.length > LIST_PREVIEW) {
        const toggle = document.createElement('li');
        toggle.className = 'toggle-more';
        toggle.textContent = streamExpanded ? 'Show less' : 'More (+' + (list.length - LIST_PREVIEW) + ')';
        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          expandState.activityStream = !expandState.activityStream;
          if (lastState) {
            paintActivityStream((lastState.activityStreamItems) || [], false);
          }
        });
        activityStreamListEl.appendChild(toggle);
      }
      lastActivityStreamHead = list[0] || '';
    }

    function paintSummary(s, opts) {
      const silent = opts && opts.silent === true;
      if (!s || !s.summary) return;
      const a = s.summary.activeFilesLine;
      const g = s.summary.gitLine;
      const act = s.summary.activityLine;
      if (sumActiveBody) {
        if (!silent && lastSumActive && a !== lastSumActive) {
          sumActiveBody.classList.remove('cr-sum-body--anim');
          void sumActiveBody.offsetWidth;
          sumActiveBody.classList.add('cr-sum-body--anim');
          setTimeout(function () { sumActiveBody.classList.remove('cr-sum-body--anim'); }, 520);
        }
        lastSumActive = a;
        sumActiveBody.textContent = a;
      }
      if (sumGitBody) {
        if (!silent && lastSumGit && g !== lastSumGit) {
          sumGitBody.classList.remove('cr-sum-body--anim');
          void sumGitBody.offsetWidth;
          sumGitBody.classList.add('cr-sum-body--anim');
          setTimeout(function () { sumGitBody.classList.remove('cr-sum-body--anim'); }, 520);
        }
        lastSumGit = g;
        sumGitBody.textContent = g;
      }
      if (sumActivityBody && sumActivityLine) {
        if (!silent && lastSumActivity && act !== lastSumActivity) {
          sumActivityLine.classList.remove('cr-sum-line--flash');
          void sumActivityLine.offsetWidth;
          sumActivityLine.classList.add('cr-sum-line--flash');
          setTimeout(function () { sumActivityLine.classList.remove('cr-sum-line--flash'); }, 1100);
        }
        lastSumActivity = act;
        sumActivityBody.textContent = act;
      }
      paintActivityStream((s && s.activityStreamItems) || [], silent);
    }

    wireClick(document.getElementById('btnByokKey'), 'configureApiKey');
    wireClick(document.getElementById('btnByokSettings'), 'openContoraSettings');
    wireClick(document.getElementById('btnFooterSettings'), 'openContoraSettings');
    wireClick(document.getElementById('btnAiSemantic'), 'generateSemanticSummary');
    wireClick(document.getElementById('btnAiIntent'), 'analyzeWorkspaceIntent');
    wireClick(document.getElementById('btnAiCompress'), 'compressContextPreview');

    function paintLists(s) {
      const suf = (s && s.recentFileActivitySuffixes) || [];
      renderCollapsibleList(recentEl, s.recentFiles || [], 'recent', suf);
      renderCollapsibleList(gitStagedEl, s.gitStaged || [], 'staged');
      renderCollapsibleList(gitWorkingEl, s.gitWorking || [], 'working');
    }

    let phasedRestoreTimers = [];
    let phasedRestoreInProgress = false;

    function restoreTargets() {
      return {
        sumActive: document.getElementById('sumActive'),
        sumGit: document.getElementById('sumGit'),
        sumActivity: document.getElementById('sumActivity'),
        secRecent: document.getElementById('crSecRecent'),
        gitDetails: document.getElementById('crGitDetails'),
        secAiGoals: document.getElementById('crSecAiGoals'),
      };
    }

    function hideAllRestoreTargets() {
      const t = restoreTargets();
      for (const k in t) {
        if (t[k]) t[k].classList.add('cr-restore-hidden');
      }
    }

    function showAllRestoreTargets() {
      const t = restoreTargets();
      for (const k in t) {
        if (t[k]) t[k].classList.remove('cr-restore-hidden');
      }
    }

    function clearPhasedRestoreFull() {
      phasedRestoreTimers.forEach(function (id) {
        clearTimeout(id);
      });
      phasedRestoreTimers = [];
      phasedRestoreInProgress = false;
      document.documentElement.classList.remove('cr-restore-hydrating');
      showAllRestoreTargets();
      const statusRow = document.getElementById('aiCardStatusRow');
      if (statusRow) statusRow.classList.remove('cr-ai-card-status--busy');
    }

    function runPhasedWorkspaceRestore(s, byok, aiIntent) {
      const activityGoals = (s && s.activityObservedGoals) || [];
      phasedRestoreTimers.forEach(function (id) {
        clearTimeout(id);
      });
      phasedRestoreTimers = [];
      phasedRestoreInProgress = true;
      const t = restoreTargets();
      document.documentElement.classList.add('cr-restore-hydrating');
      hideAllRestoreTargets();
      const aiTs = document.getElementById('aiTrackStatus');
      const statusRow = document.getElementById('aiCardStatusRow');
      if (aiTs) aiTs.textContent = 'Restoring workspace view…';
      if (statusRow) statusRow.classList.add('cr-ai-card-status--busy');

      paintSummary(s, { silent: true });
      paintLists(s);
      paintAiRibbon(byok, aiIntent, activityGoals);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.classList.remove('cr-restore-hydrating');
        });
      });

      function reveal(el) {
        if (el) el.classList.remove('cr-restore-hidden');
      }
      function rdel(ms, fn) {
        phasedRestoreTimers.push(setTimeout(fn, ms));
      }
      rdel(160, function () {
        reveal(t.sumActivity);
      });
      rdel(480, function () {
        reveal(t.sumActive);
        reveal(t.secRecent);
      });
      rdel(860, function () {
        reveal(t.secAiGoals);
        paintAiIntentPanel(aiIntent || null, activityGoals);
      });
      rdel(1220, function () {
        reveal(t.sumGit);
        reveal(t.gitDetails);
      });
      rdel(1660, function () {
        if (statusRow) statusRow.classList.remove('cr-ai-card-status--busy');
        if (aiTs) aiTs.textContent = 'Workspace tracking active';
        bumpTrackStatus(s);
        phasedRestoreInProgress = false;
        phasedRestoreTimers = [];
      });
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'state') return;
      const s = msg.state;
      const byokPayload = msg.byok || null;
      paintByok(byokPayload);
      if (!s) {
        clearPhasedRestoreFull();
        lastState = null;
        expandState.recent = false;
        expandState.staged = false;
        expandState.working = false;
        expandState.activityStream = false;
        taskEl.value = '';
        notesEl.value = '';
        paintTaskMeta();
        paintLists({ recentFiles: [], recentFileActivitySuffixes: [], gitStaged: [], gitWorking: [] });
        sumActiveBody.textContent = '—';
        sumGitBody.textContent = '—';
        sumActivityBody.textContent = 'Open a folder to start workspace tracking.';
        lastActivityStreamHead = '';
        paintActivityStream([], false);
        crVersion.textContent = 'Contora';
        lastSumGit = '';
        lastSumActive = '';
        lastSumActivity = '';
        lastRecentTop = '';
        paintAiRibbon(byokPayload, null, []);
        bumpTrackStatus(null);
        return;
      }
      const aiIntent = s.aiIntent || null;
      const prevState = lastState;
      lastState = s;
      taskEl.value = s.currentTask || '';
      notesEl.value = s.notes || '';
      paintTaskMeta();
      crVersion.textContent = 'Contora v' + (s.extensionVersion || '?');

      if (prevState === null) {
        runPhasedWorkspaceRestore(s, byokPayload, aiIntent);
        return;
      }
      if (phasedRestoreInProgress) {
        clearPhasedRestoreFull();
      }
      paintLists(s);
      paintSummary(s);
      paintAiRibbon(byokPayload, aiIntent, s.activityObservedGoals || []);
      bumpTrackStatus(s);
    });

    paintTaskMeta();
    // Defer so extension host has finished resolveWebviewView (listener + html assignment).
    setTimeout(() => vscode.postMessage({ type: 'ready' }), 0);
  </script>
</body>
</html>`;
  }
}
