# ToolFront Registry Client

Utilities for consuming the shared ToolFront provider manifest exported from
vNdydact. The package provides:

- Manifest loader / query helpers.
- ToolFront HTTP client convenience wrapper for `/ask`, `/ask/stream`, and
  `/admin` endpoints.
- Optional CLI (`toolfront-registry-client`) to inspect providers.

## Installation

```bash
pip install -e ./toolfront_registry_client
```

The package expects a manifest at `../toolfront-registry/providers.json` by
default. Override via the `TOOLFRONT_REGISTRY_PATH` environment variable if you
vendor the manifest elsewhere.

## Example

```python
from toolfront_registry_client import Registry, ToolFrontClient

registry = Registry()
provider = registry.get_provider("insight.llm")

client = ToolFrontClient(base_url="https://toolfront.api.dydact.io", api_token="token")
response = await client.ask(
    tenant_id="demo",
    provider_id="insight.llm",
    operation="invoke",
    parameters={"prompt": "hello"},
)
```

## CLI

```bash
python -m toolfront_registry_client list-providers
```

Pass `--details` to print default bindings and endpoints.
