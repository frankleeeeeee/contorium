import * as vscode from 'vscode';
import { CONTORA_CONFIG_SECTION } from '../../constants';

export type AiProviderSetting = 'off' | 'openai' | 'anthropic' | 'google' | 'deepseek';

export interface AiRuntimeSettings {
  aiProvider: AiProviderSetting;
  openaiModel: string;
  openaiBaseUrl: string;
  anthropicModel: string;
  googleModel: string;
  deepseekModel: string;
  deepseekBaseUrl: string;
  aiMaxOutputTokens: number;
}

export function readAiRuntimeSettings(): AiRuntimeSettings {
  const cfg = vscode.workspace.getConfiguration(CONTORA_CONFIG_SECTION);
  const raw = (cfg.get<string>('aiProvider') ?? 'deepseek').toLowerCase();
  const aiProvider: AiProviderSetting =
    raw === 'off' || raw === 'openai' || raw === 'anthropic' || raw === 'google' || raw === 'deepseek'
      ? raw
      : 'deepseek';
  return {
    aiProvider,
    openaiModel: cfg.get<string>('openaiModel') ?? 'gpt-4o-mini',
    openaiBaseUrl: (cfg.get<string>('openaiBaseUrl') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    anthropicModel: cfg.get<string>('anthropicModel') ?? 'claude-3-5-haiku-20241022',
    googleModel: cfg.get<string>('googleModel') ?? 'gemini-1.5-flash',
    deepseekModel: cfg.get<string>('deepseekModel') ?? 'deepseek-chat',
    deepseekBaseUrl: (cfg.get<string>('deepseekBaseUrl') ?? 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    aiMaxOutputTokens: Math.min(4096, Math.max(256, cfg.get<number>('aiMaxOutputTokens') ?? 1024)),
  };
}
