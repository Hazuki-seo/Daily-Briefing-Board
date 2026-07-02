# v9.1 balanced-selection patch

This patch fixes v9 URL-first mode where OpenAI sometimes returns 6 work items and 1 society item.

Replace only these files in the existing repository:

- scripts/update-briefings.js
- .github/workflows/update-briefings.yml
- data/sources.json (optional; same baseline as v9)

Do not delete site/, data/briefings.csv, or other existing files.
