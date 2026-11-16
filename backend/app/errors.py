"""One error type for every known failure. `message` is safe to show to students."""


class AppError(Exception):
    def __init__(
        self,
        code: str,
        status: int,
        message: str,
        *,
        retryable: bool = False,
        retry_after: float | None = None,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message
        #: Worth retrying (rate limits, provider hiccups). Read by app.retry.
        self.retryable = retryable
        #: Seconds the provider asked us to wait, if any.
        self.retry_after = retry_after
        #: Extra detail for server logs only (never sent to the client).
        self.detail = detail

    def __str__(self) -> str:
        return f"{self.code} ({self.status}): {self.message}" + (f" | {self.detail}" if self.detail else "")
