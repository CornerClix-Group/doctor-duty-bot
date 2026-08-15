# Phase 1 Execution Playbook

This document defines how we run the app improvement loop with three roles:

- **You (Product Owner):** sets goals and approves direction.
- **Codex (Implementation):** audits code, ships changes, and validates risk.
- **Claude (Product/UX Strategist):** sharpens positioning, onboarding, and copy.

## Core Weekly Goal

Ship one meaningful improvement every 1-2 days that increases one of:

- Activation (new users reach "first schedule generated")
- Reliability (fewer errors and broken flows)
- Admin efficiency (less manual scheduling overhead)

## Operating Loop (Use This Every Session)

1. **You define one outcome**
   - Example: "Increase provider onboarding completion."
2. **Prompt Codex for build changes**
   - Ask for implementation and file edits.
3. **Prompt Claude for messaging and UX framing**
   - Ask for copy, flow friction reduction, and prioritization.
4. **Apply Claude output in Lovable**
   - Use Lovable for UI/content iteration and quick experiments.
5. **Sync back to repo and re-audit**
   - Bring generated code here, then ask Codex to harden and refactor.

## Prompt Templates

### Prompt Codex (Implementation)

```text
Phase objective: <one clear business outcome>.
Current user flow: <how users do this today>.
Constraints: <tech, timeline, quality bar>.

Please:
1) audit current implementation,
2) patch highest-impact issues,
3) list tests/checks I should run locally,
4) propose the next smallest PR.
```

### Prompt Claude (Product + UX)

```text
You are product strategist for EMSchedule.
Goal: <one clear business outcome>.

Given this flow: <paste current flow>,
provide:
1) the top 3 UX/copy bottlenecks,
2) improved microcopy for each step,
3) one A/B test idea with success metric.
```

### Prompt Lovable (UI Iteration)

```text
Update the existing screen for <feature> to improve <specific metric>.
Keep existing Supabase integrations and routes intact.
Do not remove current role-based behavior.
Focus on: <layout/copy/form feedback/states>.
```

## Phase 1 Priorities

1. **Stability:** remove broken routes, dead-end actions, and inconsistent role checks.
2. **Trust:** better error states for schedule upload/generation/publish.
3. **Speed:** reduce clicks to "generate and publish schedule."
4. **Visibility:** basic analytics events for activation funnel.

## Definition of Done for a Change

- All user-visible actions route to valid pages.
- Errors are surfaced with actionable copy.
- Role restrictions are explicit and predictable.
- Change has clear before/after behavior documented in PR notes.

