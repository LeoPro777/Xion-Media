import { openai } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import OpenAI from 'openai';

export type AiProvider = 'gemini' | 'openai';

export const getAiProvider = (): AiProvider => {
  const p = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  return p === 'openai' ? 'openai' : 'gemini';
};

export const getAiApiKey = (): string => {
  if (getAiProvider() === 'gemini') {
    return process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '';
  }
  return process.env.OPENAI_API_KEY || '';
};

export const getAiModelName = (purpose: 'agent' | 'chat' | 'default' = 'default'): string => {
  if (getAiProvider() === 'gemini') {
    return process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  }
  return purpose === 'agent' ? 'gpt-5.2' : 'gpt-4.1';
};

export const getAgentLanguageModel = () => {
  if (getAiProvider() === 'gemini') {
    const gemini = createGoogleGenerativeAI({
      apiKey: getAiApiKey(),
    });
    return gemini(getAiModelName('agent'));
  }
  return openai('gpt-5.2');
};

let cachedOpenAiClient: OpenAI | null = null;
export const getOpenAiClient = (): OpenAI => {
  if (cachedOpenAiClient) {
    return cachedOpenAiClient;
  }

  if (getAiProvider() === 'gemini') {
    cachedOpenAiClient = new OpenAI({
      apiKey: getAiApiKey(),
      baseURL:
        process.env.OPENAI_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta/openai/',
    });
  } else {
    cachedOpenAiClient = new OpenAI({
      apiKey: getAiApiKey(),
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
    });
  }

  return cachedOpenAiClient;
};

export const generateAiImage = async (
  prompt: string,
  isVertical = false
): Promise<string> => {
  if (getAiProvider() === 'gemini') {
    try {
      const width = isVertical ? 1024 : 1024;
      const height = isVertical ? 1536 : 1024;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        prompt
      )}?width=${width}&height=${height}&nologo=true`;
      const res = await fetch(url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        return buffer.toString('base64');
      }
    } catch (e) {
      console.error('[AI] Image generation fallback error:', e);
    }
  }

  const client = getOpenAiClient();
  const generate = (
    await client.images.generate({
      prompt,
      model: 'chatgpt-image-latest',
      size: isVertical ? '1024x1536' : '1024x1024',
    })
  ).data[0];

  return generate.b64_json || '';
};

