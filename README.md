# v10.1 stable article ID patch

This patch fixes comments staying on the wrong article after daily news regeneration.

Replace only:

- `scripts/update-briefings.js`

What changed:

- Briefing IDs are now based on the article source URL hash: `YYYYMMDD-section-hash`.
- If the daily briefing is regenerated and a different article appears in the same slot, old comments will no longer appear on the new article.
- Comments remain stored in `data/comments.csv` and can still be used for topic weighting.
- The prompt now gives slightly stronger priority to clearly requested themes in comments/topic weights when matching candidate articles exist.

After replacing the file:

1. Commit changes.
2. Run `Update daily briefings with OpenAI` with:
   - replace_today: `true`
   - dry_run: `false`
3. Confirm that new IDs appear in `data/briefings.csv`, such as `20260703-work-a1b2c3d4`.
4. Reopen the board and confirm that old slot-based comments no longer appear on unrelated regenerated articles.
