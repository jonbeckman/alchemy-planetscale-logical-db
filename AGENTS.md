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

## Pull request flow

Open a pull request as a draft. Run lint, typecheck, and tests locally before each push. Pull request CI does not run on a draft. Full CI runs when the pull request is marked ready for review, and on each later push. Mark the pull request ready for review yourself when the work is done.

Jonathan set the draft pull request flow on 2026-10-25. Jonathan set this rule on 2026-10-26: "No CI on drafts. That should be part of our new process and playbook."
