# Changelog

## [0.4.0] - 2026-06-10

### Added

- Full CI/CD publishing pipeline with GitHub Actions (`ci.yml`, `public-reusable-npm.yml`, `create-github-release.yml`)
- Composite actions: `label-gate`, `release-merge-guard`, `publish-library-to-npm`, `publish-library-to-gpr`, `run-lint-and-unit-tests`, `run-lint-and-integration-tests`, `sfw-guard`
- npm trusted publishing (OIDC provenance) support via `npm` GitHub Actions environment
- Centralized command exports via `lib/commands/index.js`

### Changed

- Upgraded `@octokit/rest` to v22 with ESM-compatible dynamic `import()` loading
- `buildOctokit` is now async; callers updated accordingly
- Workflow uses `npm install -g` + direct CLI call instead of `npx`
- Rebranded package scope from `@qvac` to `@sidj-thr`; binary renamed to `actions-ci`

## [0.1.0] - 2026-06-04

### Added

- Initial release
- `pending-approvals` subcommand: checks PR approval status and posts a review-status comment
- Modular command architecture with `Command` base class and per-command directory layout
- Security model: secrets via env vars only, `redact()` + `sanitizeError()` on all output
