/**
 * LLM caller: Anthropic-compatible API for distillation.
 * Includes exponential-backoff retry and timeout.
 */

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

export async function callDistillation(
  systemText: string,
  userText: string,
  config: LlmConfig,
  maxRetries = 2,
): Promise<string> {
  const url = `${config.baseUrl}/v1/messages`;
  const body = {
    model: config.model,
    max_tokens: 16384,
    messages: [{ role: "user", content: userText }],
    system: systemText,
    temperature: 0.3,
  };

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        60000,
      );

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 500)}`);
      }

      const data = (await resp.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const blocks = data.content ?? [];
      return blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n");
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.error(`[llm] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export function buildDistillationPrompt(
  template: string,
  mockJson: string,
): string {
  return template.replace("{{INPUT_JSON}}", mockJson);
}
