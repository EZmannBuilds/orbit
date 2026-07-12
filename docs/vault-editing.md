# Vault Editing

The local model can propose vault edits, but it never writes notes directly.

## Workflow

1. Create a proposal.
2. Review the target path, reason, current/proposed note, and unified diff.
3. Approve or reject the proposal.
4. Apply only after approval.
5. Before applying, Orbit re-reads the note and confirms the hash still matches.
6. Orbit writes a timestamped backup, applies atomically, validates
   frontmatter, and appends an audit record.

The proposal shows the generating model, prompt version, retrieved sources,
validation result, current content, proposed content, and unified diff. A changed
target hash marks the proposal stale and prevents application. Model-generated
content must preserve stable IDs and `created_at`, increment versions exactly
once, remain under the configured size limit, and use a supported note type.

Audit log:

```text
Orbit vault/System/Logs/local-llm-vault-edits.jsonl
```

Backups:

```text
Orbit vault/System/Archive/LLM Edits/YYYY/MM/
```

## Approved Write Folders

- `07 Orbit App/Product/`
- `07 Orbit App/Features/`
- `07 Orbit App/UX/`
- `07 Orbit App/Technical/`
- `07 Orbit App/Roadmap/`
- `07 Orbit App/Decisions/`
- `07 Orbit App/Updates/`
- `07 Orbit App/Release Notes/`
- `10 Business/Strategy/`
- `10 Business/Research/`
- `10 Business/Market/`
- `10 Business/Pricing/`
- `10 Business/Revenue/`
- `10 Business/Operations/`
- `10 Business/Launch/`
- `10 Business/Reports/`

Personal astrology, tarot, identity, people, journal, attachments, templates,
`.obsidian`, schema, migrations, and archive folders are not writable.
