from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable, TypeVar

T = TypeVar("T")


@dataclass
class CircuitBreakerConfig:
    failure_threshold: int = 5
    recovery_timeout: float = 60.0  # seconds


class CircuitBreaker:
    def __init__(self, name: str, config: CircuitBreakerConfig | None = None) -> None:
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._failures = 0
        self._opened_at: float | None = None

    @property
    def is_open(self) -> bool:
        if self._opened_at is None:
            return False
        if (time.monotonic() - self._opened_at) >= self.config.recovery_timeout:
            self._failures = 0
            self._opened_at = None
            return False
        return True

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.config.failure_threshold:
            self._opened_at = time.monotonic()

    def guard(self, func: Callable[..., T], *args, **kwargs) -> T:
        if self.is_open:
            raise RuntimeError(f"Circuit '{self.name}' is open")
        try:
            result = func(*args, **kwargs)
        except Exception:  # pragma: no cover - thin wrapper
            self.record_failure()
            raise
        else:
            self.record_success()
            return result
