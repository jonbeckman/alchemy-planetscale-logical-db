# AGENTS.md

## Voice

Use Simplified Technical English in formal, operational, and other sensible components of the document where you’re establishing specifics.
Use Plain Language in introductory, expository, friendly, and other sensible components of the document where you’re drawing the reader in or keeping them engaged.

## Cloud-agent PR artifacts

A cloud-agent pull request on this library must carry proof as a cloud-agent artifact. The proof is a log of the test run and the build. Leave that log untracked.

Jonathan set this rule on 2026-10-24. The lead-dev-playbook skill relays it.

Call the verify skill `verify-logical-db` (`.cursor/skills/verify-logical-db/SKILL.md`). The skill writes the Evidence log. Cleanup keeps the log in `.cursor/skills/verify-logical-db/artifacts/<run-id>/`.

Skip artifacts for pin-only, config-only, and markdown-only work.

See [Cloud Agent capabilities](https://cursor.com/docs/cloud-agent/capabilities).
