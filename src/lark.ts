/**
 * Lark CLI wrapper: list chats, fetch messages, download resources.
 * Includes exponential-backoff retry for transient failures.
 */
import { execFile } from "node:child_process";

export type LarkMessage = {
  message_id: string;
  sender: { id: string; name?: string };
  create_time: string;
  msg_type: string;
  content: string;
};

export type LarkChat = {
  chat_id: string;
  name: string;
  chat_type?: string;
};

function execFilePromise(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { encoding: "utf-8", timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) {
          if (stderr) {
            reject(new Error(`${err.message}\nstderr: ${stderr.trim()}`));
          } else {
            reject(err);
          }
        } else {
          if (stderr) {
            console.error(`[lark] stderr: ${stderr.trim()}`);
          }
          resolve(stdout);
        }
      },
    );
    child.unref?.();
  });
}

async function runLark(
  args: string[],
  cliPath: string,
  maxRetries = 2,
): Promise<unknown> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const stdout = await execFilePromise(cliPath, args, 30000);
      return JSON.parse(stdout);
    } catch (e) {
      lastError = e as Error;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.error(`[lark] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export async function listChats(cliPath: string): Promise<LarkChat[]> {
  const resp = (await runLark(["im", "chats", "list"], cliPath)) as {
    data?: { items?: LarkChat[] };
  };
  return resp.data?.items ?? [];
}

export async function listMessages(
  chatId: string,
  cliPath: string,
  pageSize = 50,
  lookbackDays = 7,
): Promise<LarkMessage[]> {
  const resp = (await runLark(
    ["im", "+chat-messages-list", "--chat-id", chatId, "--page-size", String(pageSize)],
    cliPath,
  )) as { data?: { messages?: LarkMessage[] } };
  const items = (resp.data?.messages ?? []).map((m) => ({
    message_id: m.message_id,
    sender: { id: m.sender?.id ?? "", name: m.sender?.name },
    create_time: m.create_time,
    msg_type: m.msg_type,
    content: m.content,
  }));
  if (lookbackDays <= 0) return items;
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return items.filter((m) => {
    const ts = new Date(m.create_time).getTime();
    return !Number.isNaN(ts) && ts >= cutoff;
  });
}

export function formatMessagesForPrompt(
  messages: LarkMessage[],
  chatName: string,
  chatId: string,
): string {
  const lines = [
    `{`,
    `  "chat_id": "${chatId}",`,
    `  "chat_name": "${chatName}",`,
    `  "messages": [`,
  ];
  for (const m of messages) {
    const content = m.content.replace(/"/g, '\\"').replace(/\n/g, "\\n");
    lines.push(
      `    { "message_id": "${m.message_id}", "sender": "${m.sender.id}", "create_time": "${m.create_time}", "msg_type": "${m.msg_type}", "content": "${content}" },`,
    );
  }
  // Remove trailing comma from last item
  if (lines[lines.length - 1]?.endsWith(",")) {
    lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
  lines.push(`  ]`);
  lines.push(`}`);
  return lines.join("\n");
}
