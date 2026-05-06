#!/usr/bin/env python3
"""
最小 distillation runner：读取 mock 数据 + skill prompt → 调用 DeepSeek Anthropic API → 输出 markdown
"""
import json
import os
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API_BASE = "https://api.deepseek.com/anthropic"
API_KEY = "sk-4b074e35c5f646f8b0e7d8e060c1f1bb"
MODEL = "deepseek-v4-pro[1m]"

def load_mock():
    path = os.path.join(BASE_DIR, "mock_data", "week1_omega_chat.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_prompt():
    path = os.path.join(BASE_DIR, "prompts", "distill_v1.skill.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def build_prompt(mock_data):
    template = load_prompt()
    mock_json_str = json.dumps(mock_data, ensure_ascii=False, indent=2)
    return template.replace("{{INPUT_JSON}}", mock_json_str)

def call_deepseek_anthropic(system_text, user_text):
    url = f"{API_BASE}/v1/messages"
    body = {
        "model": MODEL,
        "max_tokens": 16384,
        "messages": [
            {"role": "user", "content": user_text},
        ],
        "system": system_text,
        "temperature": 0.3,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))

def save_result(raw_json, content):
    results_dir = os.path.join(BASE_DIR, "results")
    os.makedirs(results_dir, exist_ok=True)

    md_path = os.path.join(results_dir, "distill_deepseek_v4.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)

    raw_path = os.path.join(results_dir, "distill_deepseek_v4.raw.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw_json, f, ensure_ascii=False, indent=2)

    print(f"  Saved -> {md_path}")
    return md_path

def main():
    print("Loading mock data...")
    mock_data = load_mock()
    msgs = mock_data.get("messages", [])
    print(f"  Loaded {len(msgs)} messages")

    print("Loading prompt template...")
    prompt = build_prompt(mock_data)
    print(f"  Prompt length: {len(prompt)} chars")

    system_text = "你是一个精确、克制的企业上下文萃取器。严格按照用户给出的规则输出。"

    print(f"\nCalling DeepSeek Anthropic API with model: {MODEL} ...")
    try:
        raw = call_deepseek_anthropic(system_text, prompt)
        # Anthropic format: content = list of blocks, text in blocks
        content_blocks = raw.get("content", [])
        if content_blocks and isinstance(content_blocks, list):
            content = "\n".join(
                block.get("text", "")
                for block in content_blocks
                if block.get("type") == "text"
            )
        else:
            content = str(content_blocks)
        md_path = save_result(raw, content)
        print(f"  Success! Output: {len(content)} chars")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        print(f"  HTTPError {e.code}: {body[:800]}")
        return 1
    except Exception as e:
        print(f"  Error: {e}")
        return 1

    return 0

if __name__ == "__main__":
    exit(main())
