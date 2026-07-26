@AGENTS.md

# Assistant workflow preference

Do not dispatch background/Agent subagents for DishFrame work — not for
research/lookups, not for implementation, foreground or background, single
or parallel. Do all reads, greps, and implementation directly in-session.
This applies to quick one-off lookups too, not just multi-step delegated
work. This also keeps total token usage lower, not higher: a spawned agent
starts cold and re-derives context (re-reading files, re-establishing task
context) that this session already has loaded, duplicating spend rather
than saving it.
