---
tracker:
  kind: linear
  project_slug: card-game
  active_states:
    - Todo
    - In Progress
  api_key: "$LINEAR_API_KEY"

polling:
  interval_ms: 30000

workspace:
  root: "/tmp/symphony_workspaces"

agent:
  max_concurrent_agents: 1
  max_retry_backoff_ms: 60000

# Using Gemini CLI as the agent runner in autonomous mode
codex:
  command: "gemini \"Виконай завдання, описане в @INSTRUCTION.md\" --approval-mode=yolo"

hooks:
  after_create: "echo 'Workspace created for Gemini'"
  before_run: "echo 'Invoking Gemini agent...'"
  after_run: "echo 'Gemini agent finished execution'"
  before_remove: "echo 'Cleaning up Gemini workspace'"
---

# Інструкція для ШІ-агента

Проаналізуй наведене нижче завдання та реалізуй рішення.

Заголовок: {{title}}
Опис: {{description}}
Ідентифікатор: {{identifier}}

Дотримуйся стандартів кодування проекту та переконайся, що тести проходять успішно.
