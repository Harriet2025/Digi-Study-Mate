"""Retry with exponential backoff for calls to Groq and ElevenLabs."""

import random
import time
from collections.abc import Callable
from typing import TypeVar

from .errors import AppError

T = TypeVar("T")


def with_retry(fn: Callable[[], T], *, attempts: int = 4, base_delay: float = 1.0, max_delay: float = 30.0) -> T:
    """Calls `fn`, retrying AppErrors marked `retryable` (429 / 5xx / network). Honours Retry-After."""
    for attempt in range(1, attempts + 1):
        try:
            return fn()
        except AppError as err:
            if not err.retryable or attempt == attempts:
                raise
            backoff = min(max_delay, base_delay * 2 ** (attempt - 1))
            jittered = backoff / 2 + random.random() * backoff / 2
            time.sleep(max(err.retry_after or 0, jittered))
    raise AssertionError("unreachable")
