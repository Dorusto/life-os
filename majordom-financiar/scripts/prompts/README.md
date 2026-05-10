# DeepSeek Prompts

Each file in this folder is a self-contained prompt for DeepSeek — one task per file.

**How to use without Claude:**
1. Open the relevant `.md` file
2. Copy the full content
3. Paste into DeepSeek chat (deepseek.com or API via ai_helper.py)
4. Apply the generated code, test, commit

**File naming:** `NNN_short-description.md` (e.g. `001_fix-429-chat-context.md`)

**Each prompt includes:**
- Context: what Majordom is, relevant files and line numbers
- Current behavior (the bug or missing feature)
- Expected behavior
- Constraints: what NOT to change
- Exact output requested (which files, which functions)
