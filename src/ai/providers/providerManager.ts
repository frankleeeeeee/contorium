import type { ContoraKeyManager } from '../auth/keyManager';
import type { StoredProviderId } from '../auth/keyManager';
import { readAiRuntimeSettings } from '../auth/providerConfig';

export type ChatRole = 'system' | 'user';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export class ProviderManager {
  constructor(private readonly keys: ContoraKeyManager) {}

  /** Returns assistant plain text, or throws on HTTP / missing key. */
  async completeChat(turns: ChatTurn[]): Promise<string> {
    const s = readAiRuntimeSettings();
    if (s.aiProvider === 'off') {
      throw new Error('AI provider is off (set contorium.aiProvider and store an API key).');
    }
    const keyId: StoredProviderId = s.aiProvider;
    const apiKey = await this.keys.getKey(keyId);
    if (!apiKey) {
      throw new Error(`No API key stored for ${s.aiProvider}. Run "Contorium: Configure API key…".`);
    }
    if (s.aiProvider === 'openai') {
      return completeOpenAI(s.openaiBaseUrl, apiKey, s.openaiModel, turns, s.aiMaxOutputTokens, 'OpenAI');
    }
    if (s.aiProvider === 'deepseek') {
      return completeOpenAI(
        s.deepseekBaseUrl,
        apiKey,
        s.deepseekModel,
        turns,
        s.aiMaxOutputTokens,
        'DeepSeek',
      );
    }
    if (s.aiProvider === 'anthropic') {
      return completeAnthropic(apiKey, s.anthropicModel, turns, s.aiMaxOutputTokens);
    }
    return completeGemini(apiKey, s.googleModel, turns, s.aiMaxOutputTokens);
  }
}

async function completeOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  turns: ChatTurn[],
  maxTokens: number,
  providerLabel = 'OpenAI',
): Promise<string> {
  const url = `${baseUrl}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${providerLabel} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`${providerLabel}: empty response`);
  }
  return text;
}

async function completeAnthropic(
  apiKey: string,
  model: string,
  turns: ChatTurn[],
  maxTokens: number,
): Promise<string> {
  const system = turns.filter((t) => t.role === 'system').map((t) => t.content).join('\n\n');
  const messages = turns
    .filter((t) => t.role === 'user')
    .map((t) => ({ role: 'user' as const, content: t.content }));
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: system || undefined,
      messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = data.content?.find((c) => c.type === 'text');
  if (!block?.text) {
    throw new Error('Anthropic: empty response');
  }
  return block.text;
}

async function completeGemini(
  apiKey: string,
  model: string,
  turns: ChatTurn[],
  maxTokens: number,
): Promise<string> {
  const blob = turns.map((t) => `${t.role.toUpperCase()}:\n${t.content}`).join('\n\n---\n\n');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: blob }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini: empty response');
  }
  return text;
}
