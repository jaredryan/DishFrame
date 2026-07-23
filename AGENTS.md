<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow rules

- Run verification (lint, typecheck, unit tests, build, e2e, etc.) once at
  the end of a task, in a single pass — not incrementally after every
  change.
- Never `git commit` or `git push` unless the user explicitly asks for it
  in that turn. Leave changes staged/unstaged for the user to review and
  commit themselves.
