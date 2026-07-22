# Contributing

## Working Agreement

- Treat Congress.gov as the primary source and preserve source links.
- Do not commit secrets, raw API-key URLs, or user data.
- Do not introduce a status label that can be mistaken for an official legal determination.
- Keep preview/demo data visibly marked and fictional.

## Before Opening a Pull Request

```bash
pnpm check
pnpm build
```

Run `pnpm test:e2e` when changing navigation, forms, or layout behavior. Every data adapter change should include a
fixture or unit test for the upstream shape it supports.
