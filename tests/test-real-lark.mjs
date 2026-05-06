/**
 * Standalone lark-cli integration test.
 * Validates listChats + listMessages against real Feishu data.
 */
import { execSync } from "node:child_process";

function runLark(cmd) {
  const stdout = execSync(`lark-cli ${cmd}`, { encoding: "utf-8", timeout: 30000 });
  return JSON.parse(stdout);
}

function listChats() {
  const resp = runLark("im chats list");
  return resp.data?.items ?? [];
}

function listMessages(chatId, pageSize = 50, lookbackDays = 7) {
  const resp = runLark(`im +chat-messages-list --chat-id ${chatId} --page-size ${pageSize}`);
  const items = (resp.data?.messages ?? []).map((m) => ({
    message_id: m.message_id,
    sender_id: m.sender?.id ?? "",
    sender_name: m.sender?.name ?? "",
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

console.log("🧪 Real lark-cli Integration Test\n");

// 1. List chats
const chats = listChats();
console.log(`📋 Found ${chats.length} chats:`);
for (const c of chats) {
  console.log(`  - ${c.name} (${c.chat_id})`);
}

if (chats.length === 0) {
  console.log("❌ No chats found. Is lark-cli authenticated?");
  process.exit(1);
}

// 2. Pick the contest-related chat
const contestChat = chats.find((c) => c.name.includes("OpenClaw") || c.name.includes("Memory"));
const targetChat = contestChat ?? chats[0];
console.log(`\n📁 Selected chat: ${targetChat.name} (${targetChat.chat_id})`);

// 3. Fetch messages
const messages = listMessages(targetChat.chat_id, 50, 7);
console.log(`💬 Fetched ${messages.length} messages (last 7 days)`);

// 4. Content analysis
const typeCounts = {};
const senderCounts = {};
for (const m of messages) {
  typeCounts[m.msg_type] = (typeCounts[m.msg_type] ?? 0) + 1;
  senderCounts[m.sender_name] = (senderCounts[m.sender_name] ?? 0) + 1;
}

console.log("\n📊 Message types:");
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`  ${type}: ${count}`);
}

console.log("\n👤 Senders:");
for (const [name, count] of Object.entries(senderCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name || "(unknown)"}: ${count}`);
}

// 5. Show latest 3 messages
console.log("\n📝 Latest 3 messages:");
for (const m of messages.slice(0, 3)) {
  const preview = m.content.replace(/\n/g, " ").slice(0, 100);
  console.log(`  [${m.create_time}] ${m.sender_name}: ${preview}${m.content.length > 100 ? "..." : ""}`);
}

console.log("\n✅ lark-cli integration test complete.");
