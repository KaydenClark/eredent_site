# eredent_site local coordination

- The canonical Windows checkout is `E:/GPT_OS/Projects/eredent_site`. Claude and
  Codex use this folder. The former `E:/GPT_OS/eredent_site/*` worktrees are retired.
- Read `README.md` for running, testing, and local recovery. Preserve unrelated
  working files and unfinished work; inspect Git status before editing.
- Use the existing checkout by default. Coordinate concurrent edits rather than
  silently creating another clone or worktree. Create a temporary worktree only
  when the owner explicitly requests isolated simultaneous work, and remove it
  after its work is integrated and local files are preserved.
- Share the development preview at `http://127.0.0.1:5173/`. Reuse it when it is
  running. Start `npm run dev` here only when it is stopped. If the port is occupied,
  inspect the listener; do not work around it by choosing another port or stopping
  an unrelated process.
- Keep `.local-recovery/` and private maps local. The recovery branch named in
  README preserves unfinished code; it is not accepted integrated behavior.
- For code changes, use red/green tests and run `npm test` and `npm run build`.
