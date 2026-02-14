# ToolFront Registry Manifest

This directory is generated from the dydact ToolFront gateway and acts as the
canonical manifest consumed by other projects (taskR, scrAIv, etc.).

## Contents

- `providers.json` – list of ToolFront providers, operations, default bindings,
  and per-environment endpoints.

## Regenerating

From `platform/dydact` run:

```bash
make export-toolfront-registry
```

The command rewrites `providers.json`. Commit the updated manifest alongside any
ToolFront provider changes.

## Versioning & Drift

Downstream repos should vendor this directory and add CI checks that fail if
their copy diverges from the latest exported manifest. Keep semantic changes
(backwards-incompatible renames, deleted providers) coordinated across projects.

## Adding Providers

1. Register the provider in `services/toolfront/main.py`.
2. Update default bindings under `config/toolfront/default_bindings.json` if
   required.
3. Re-run `make export-toolfront-registry` and commit the new manifest.

