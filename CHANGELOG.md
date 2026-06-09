# Changelog

All notable changes to the GRQ FX Validation Dashboard are documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on versioning.** The published PWA carries an auto-incrementing
> `major.minor.patch` build version (see
> [`VERSION_SYSTEM.md`](VERSION_SYSTEM.md)) that the `scripts/pre-commit` hook
> bumps on every change under `docs/`. This changelog records *notable* changes
> for human readers and does not list every automated patch bump.

## [Unreleased]

### Added

- `CONTRIBUTING.md` — toolchain setup (Deno + Node), how to run `./quality.sh`,
  the `scripts/pre-commit` version-bump workflow and the pull request process
  against `Develop` (issue #79).
- `CHANGELOG.md` — this file, following the Keep a Changelog format (issue #79).
