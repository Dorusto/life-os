"""
Async HTTP client for investment-manager service (read-only).

Mirrors the structure of backend/core/vehicle_client/client.py — base URL from
settings, X-Service-Token header auth, httpx. Unlike VehicleClient, every
method here degrades gracefully: investment-manager is an optional compose
profile, so coaching features (#167/#177) must never break majordom-financiar's
own dashboard when the service is down or unconfigured. Failures are logged and
return None rather than raised.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from backend.core.config import settings

logger = logging.getLogger(__name__)

BASE_TIMEOUT = httpx.Timeout(10.0)  # internal service on same Docker network
HEALTH_TIMEOUT = httpx.Timeout(5.0)  # status checks must not stall the Settings page


class InvestmentClient:
    """Read-only async HTTP client for investment-manager."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.investment_manager.url).rstrip("/")

    def _auth_headers(self) -> dict[str, str]:
        """Service-token header sent on every request — investment-manager
        authenticates all routes, including internal server-to-server calls."""
        return {"X-Service-Token": settings.investment_manager.service_token}

    async def _get(self, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        headers = {**self._auth_headers(), **kwargs.pop("headers", {})}
        try:
            async with httpx.AsyncClient(timeout=BASE_TIMEOUT) as client:
                resp = await client.get(url, headers=headers, **kwargs)
                resp.raise_for_status()
                return resp.json()
        except httpx.TimeoutException:
            logger.warning("investment-manager timed out connecting to %s", url)
            return None
        except httpx.ConnectError:
            logger.warning(
                "Could not connect to investment-manager at %s — is the service running?",
                self.base_url,
            )
            return None
        except httpx.HTTPStatusError as e:
            logger.warning(
                "investment-manager returned %s for %s: %s",
                e.response.status_code,
                url,
                e.response.text[:200],
            )
            return None

    async def get_portfolio_value(self) -> dict | None:
        """Return the current total portfolio value in EUR (with `as_of`,
        `currency` and open-position `positions` count), or None if the service
        is unreachable / returns an error.

        This is investment-manager's minimal read-only surface built for the
        coaching layer (#167/#177) — no market-data detail, see its
        `GET /portfolio/value` route. Callers must treat None as "portfolio
        unavailable", never as zero.
        """
        return await self._get("/portfolio/value")

    async def health(self) -> bool:
        """Whether investment-manager's unauthenticated ``GET /health`` answers 200.

        Backs ``GET /api/investment/status`` so Settings → Connections can show a
        real state for Invest instead of echoing a URL. No auth header: that
        route is deliberately unauthenticated (it is the Docker healthcheck's
        entry point), so False here means unreachable, never unauthorized.
        """
        url = f"{self.base_url}/health"
        try:
            async with httpx.AsyncClient(timeout=HEALTH_TIMEOUT) as client:
                resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning(
                    "investment-manager health check returned %s for %s",
                    resp.status_code,
                    url,
                )
                return False
            return True
        except httpx.TimeoutException:
            logger.warning("investment-manager health check timed out connecting to %s", url)
            return False
        except httpx.ConnectError:
            logger.warning(
                "Could not connect to investment-manager at %s — is the service running?",
                self.base_url,
            )
            return False
        except httpx.HTTPError as e:
            logger.warning("investment-manager health check failed for %s: %s", url, e)
            return False
