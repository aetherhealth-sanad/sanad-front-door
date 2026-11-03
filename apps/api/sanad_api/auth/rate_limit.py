"""Per-IP rate limits for the public write endpoints. IPs stay in memory and are never logged."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request

from sanad_api.errors import ApiError, ErrorCode

WINDOW_SECONDS = 60.0


class RateLimiter:
    def __init__(self, limit_per_minute: int) -> None:
        self.limit = limit_per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


def rate_limited(bucket: str) -> Callable[[Request], None]:
    def dependency(request: Request) -> None:
        limiter: RateLimiter = request.app.state.rate_limiters[bucket]
        client = request.client.host if request.client else "unknown"
        if not limiter.allow(client):
            raise ApiError(429, ErrorCode.RATE_LIMITED)

    return dependency
