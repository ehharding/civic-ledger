# Civic Ledger Documentation

| Document                           | Read it for                                                                        |
|------------------------------------|------------------------------------------------------------------------------------|
| [architecture.md](architecture.md) | The shape of the system: boundaries, the Congress adapter, data flow, shared rules |
| [data-policy.md](data-policy.md)   | What the product claims about congressional records, and what it refuses to claim  |
| [deployment.md](deployment.md)     | The two pipelines, what each one can serve, and how to configure them              |
| [roadmap.md](roadmap.md)           | What is deliberately not built yet, and what has to be true before it is           |

Repository-root documents: [README](../README.md) (what this is, how to run it), [CONTRIBUTING](../CONTRIBUTING.md) (how
to work on it, including these conventions), [SECURITY](../SECURITY.md) (reporting a vulnerability),
[CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md).

## Where Documentation Goes

The rule is **one home per fact**, decided by audience rather than by topic:

| If it is…                                               | It belongs in…             |
|---------------------------------------------------------|----------------------------|
| Why *this line of code* is the way it is                | A doc comment on that code |
| A rule that spans modules, or a boundary between them   | `architecture.md`          |
| A claim or refusal about the data a reader sees         | `data-policy.md`           |
| Something an operator does to ship or configure the app | `deployment.md`            |
| Something a contributor does or must not do             | `CONTRIBUTING.md`          |
| Not built yet, and gated on something                   | `roadmap.md`               |
| How to run this thing at all                            | `README.md`                |

**The default is the code comment.** These four documents exist for reasoning that has nowhere else to live because it
spans files, constrains the product, or has to be found by someone who is not already reading the relevant module.
Reasoning about one function, one component, or one CSS rule belongs beside it — where it is read at the moment it is
needed, and where it goes stale visibly instead of quietly.

That is also why this project has no running decision log. A file ordered by when things were decided is one readers do
not think to open, and the reasoning in it is either already stated — better — in the code it describes, or is a
cross-cutting rule belonging to one of the documents above. If a decision is worth recording and fits none of the rows
above, that is a strong signal it is a code comment.

## Style

- Wrap at 120 columns, matching `biome.jsonc`'s `lineWidth`.
- Link to files with backticked paths (`` `src/lib/congress/upstream/http.ts` ``) and to documents with Markdown links.
- Name the constant, function, or file that enforces a rule. A rule with no named enforcement point is a wish.
- State costs and limits explicitly. A tradeoff written down is a tradeoff someone else does not have to rediscover.
- **Describe what is, never what was.** A sentence about a previous shape of the code has to be checked against the
  present one before it can be trusted, which makes it worse than no sentence. State the rule and the reason it holds;
  Git already holds the rest.
