# Alongside

Browser-based multiplayer 3D space (mobile web, iOS and Android) along a virtual
Toronto Waterfront. Two modes: Rest Together and Run Together. See the project
concept for the design rules: presence over performance, no rankings, no chat.

## How we write code

- Ponytail is on for this repo (`.claude/settings.json`). Write the smallest
  change that fully works. Mark deliberate shortcuts with a `shortcut:` comment
  that names the limit.

## How drafts get reviewed

1. Every change goes on its own branch and opens as a **draft pull request**.
   Never push straight to `main`.
2. Before asking for review, run on the draft:
   - `/ponytail-review` for bugs, load, missing tests and extra code.
   - `/security-review`. Pay extra attention to multiplayer networking
     (trust nothing a client sends) and phone motion-sensor permissions.
3. Post the findings as inline comments on the PR, numbered the way
   `/ponytail-review` numbers them.
4. Fix only the findings the reviewer picks ("fix 1 and 3"). Re-run the review
   after the fixes.
5. When the verdict is "Ship", mark the PR ready for review. A human merges.
