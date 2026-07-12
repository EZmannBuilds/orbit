# Data Boundaries

Orbit uses two knowledge/data layers.

## Obsidian Vault

The vault stores human-readable project and business knowledge:

- product definitions
- feature specifications
- app updates
- release notes
- roadmaps
- implementation plans
- technical and UX decisions
- business strategy, research, pricing, revenue, launch, and reports

Narrative business reports belong in the vault.

## Supabase

Supabase stores live structured application data:

- accounts and profiles
- birth profiles, coordinates, timezone identifiers
- chart settings and calculated chart JSON
- transits and celestial events
- tarot readings and journal entries
- user preferences and notifications
- runtime logs and LLM run metadata
- vault edit proposals and note version records
- structured business metrics

Raw monthly revenue rows, subscription counts, active users, conversion rates,
and operating expenses belong in Supabase. A human-readable monthly business
review may read those rows and save a narrative summary into the vault.

Never store passwords, API keys, tokens, private journal entries, or production
database authority in Markdown.
