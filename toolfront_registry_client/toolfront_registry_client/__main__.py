"""CLI helpers for inspecting the ToolFront manifest."""

from __future__ import annotations

import argparse
import json
from typing import Any

from .manifest import Provider, Registry


def _format(provider: Provider, show_details: bool) -> str:
    ops = ", ".join(provider.operations) or "-"
    provider_id = provider.id
    line = f"{provider_id}: {ops}"
    if show_details:
        details = {
            "default_binding": provider.default_binding,
            "endpoints": provider.endpoints,
            "policy_notes": provider.policy_notes,
        }
        line += "\n" + json.dumps(details, indent=2)
    return line


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect ToolFront providers")
    parser.add_argument("command", choices=["list-providers"], help="Command to execute")
    parser.add_argument("--manifest", dest="manifest", help="Path to providers.json")
    parser.add_argument("--details", action="store_true", help="Show binding and endpoint details")
    args = parser.parse_args()

    registry = Registry(args.manifest)
    if args.command == "list-providers":
        for provider_id in registry.list_providers():
            entry = registry.require_provider(provider_id)
            line = _format(entry, args.details)
            print(line)


if __name__ == "__main__":
    main()
