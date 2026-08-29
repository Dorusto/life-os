"""Thin async HTTP client for majordom-api's internal vehicle-account sync.

This client is deliberately non-raising: on any network error, HTTP error, or
unexpected response it logs a warning and returns None. Callers use None to
mean "sync failed; leave the vehicle's existing ab_account_id unchanged".
"""
import logging
import os

import httpx

logger = logging.getLogger(__name__)


def get_majordom_api_url() -> str:
    """Return the majordom-api base URL, overridable via MAJORDOM_API_URL."""
    return os.getenv("MAJORDOM_API_URL", "http://majordom-api:8000")


async def sync_vehicle_account(
    name: str,
    current_value: float,
    ab_account_id: str | None,
) -> str | None:
    """Call POST /internal/vehicle-accounts/sync on majordom-api.

    Returns the new ab_account_id on success, or None on any failure.
    Never raises.
    """
    url = f"{get_majordom_api_url().rstrip('/')}/internal/vehicle-accounts/sync"
    payload = {
        "name": name,
        "current_value": current_value,
        "ab_account_id": ab_account_id,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("ab_account_id")
    except httpx.HTTPStatusError as e:
        logger.warning(
            "Vehicle account sync failed (HTTP %s): %s",
            e.response.status_code,
            e.response.text[:200],
        )
    except httpx.TimeoutException:
        logger.warning("Vehicle account sync timed out")
    except httpx.RequestError as e:
        logger.warning("Vehicle account sync request failed: %s", e)
    except Exception as e:
        logger.warning("Vehicle account sync unexpected error: %s", e)

    return None
