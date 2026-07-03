"""
Async HTTP client for vehicle-manager service.

Mirrors the structure of backend/core/actual_client/ — each vehicle-manager
REST endpoint is exposed as an async method on VehicleClient.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_TIMEOUT = httpx.Timeout(10.0)  # internal service on same Docker network


class VehicleClientError(Exception):
    """Raised on connection failure or unexpected HTTP errors from vehicle-manager."""


class VehicleClient:
    """Async HTTP client for vehicle-manager."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def _get(self, path: str, **kwargs) -> Any:
        return await self._request("GET", path, **kwargs)

    async def _post(self, path: str, **kwargs) -> Any:
        return await self._request("POST", path, **kwargs)

    async def _patch(self, path: str, **kwargs) -> Any:
        return await self._request("PATCH", path, **kwargs)

    async def _delete(self, path: str, **kwargs) -> Any:
        return await self._request("DELETE", path, **kwargs)

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self.base_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=BASE_TIMEOUT) as client:
                resp = await client.request(method, url, **kwargs)
                resp.raise_for_status()
                if resp.status_code == 204:
                    return True
                return resp.json()
        except httpx.TimeoutException:
            raise VehicleClientError(
                f"vehicle-manager timed out after {BASE_TIMEOUT} connecting to {url}"
            )
        except httpx.ConnectError:
            raise VehicleClientError(
                f"Could not connect to vehicle-manager at {self.base_url}. "
                "Is the service running?"
            )
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            if e.response.status_code == 400:
                detail = e.response.json().get("detail", "Bad request")
                raise VehicleClientError(detail)
            raise VehicleClientError(
                f"vehicle-manager returned {e.response.status_code}: {e.response.text[:200]}"
            )

    # -----------------------------------------------------------------------
    # Vehicles
    # -----------------------------------------------------------------------

    async def list_vehicles(self, active_only: bool = True) -> list[dict]:
        """Return list of vehicles. active_only filters to active=1."""
        params = {"active_only": "true" if active_only else "false"}
        result = await self._get("/vehicles", params=params)
        return result if isinstance(result, list) else []

    async def get_vehicle(self, vehicle_id: int) -> dict | None:
        """Return a single vehicle by id, or None on 404."""
        return await self._get(f"/vehicles/{vehicle_id}")

    async def upsert_vehicle(self, data: dict) -> int:
        """Upsert a vehicle. Returns the vehicle id."""
        result = await self._post("/vehicles", json=data)
        if isinstance(result, dict) and "id" in result:
            return result["id"]
        raise VehicleClientError(f"Unexpected upsert_vehicle response: {result!r}")

    async def patch_vehicle(self, vehicle_id: int, **fields) -> bool:
        """Update vehicle fields. Returns False on 404."""
        result = await self._patch(f"/vehicles/{vehicle_id}", json=fields)
        return result is not None

    # -----------------------------------------------------------------------
    # Log entries
    # -----------------------------------------------------------------------

    async def get_log(
        self, vehicle_id: int, limit: int = 10, entry_type: str | None = None
    ) -> list[dict]:
        """Return log entries for a vehicle."""
        params: dict[str, Any] = {"limit": limit}
        if entry_type:
            params["entry_type"] = entry_type
        result = await self._get(f"/vehicles/{vehicle_id}/log", params=params)
        return result if isinstance(result, list) else []

    async def insert_log_entries(
        self, vehicle_id: int, entries: list[dict]
    ) -> tuple[int, int]:
        """Batch insert log entries. Returns (inserted, skipped)."""
        result = await self._post(f"/vehicles/{vehicle_id}/log", json=entries)
        if isinstance(result, dict):
            return result.get("inserted", 0), result.get("skipped", 0)
        return 0, len(entries)

    async def get_log_entry(self, entry_id: int) -> dict | None:
        """Return a single log entry by id, or None on 404."""
        return await self._get(f"/log/{entry_id}")

    async def delete_log_entry(self, entry_id: int) -> bool:
        """Delete a log entry. Returns False on 404."""
        result = await self._delete(f"/log/{entry_id}")
        if isinstance(result, dict) and result.get("deleted"):
            return True
        return False

    # -----------------------------------------------------------------------
    # Fuel-specific helpers
    # -----------------------------------------------------------------------

    async def get_last_fuel_entry(self, vehicle_id: int) -> dict | None:
        """Return the most recent full-tank fuel entry for consumption calculation."""
        return await self._get(f"/vehicles/{vehicle_id}/last-fuel-entry")

    async def get_stats(self, vehicle_id: int, period: str = "") -> dict | None:
        """Return operational stats for a vehicle."""
        params = {}
        if period:
            params["period"] = period
        return await self._get(f"/vehicles/{vehicle_id}/stats", params=params)

    # -----------------------------------------------------------------------
    # Fuelio import proxy
    # -----------------------------------------------------------------------

    async def import_fuelio(self, file_bytes: bytes, filename: str) -> dict:
        """Forward a Fuelio CSV to vehicle-manager as multipart upload.

        On error, vehicle-manager's HTTPException status/detail propagate
        up as-is via _request.
        """
        url = f"{self.base_url}/import/fuelio"
        try:
            async with httpx.AsyncClient(timeout=BASE_TIMEOUT) as client:
                resp = await client.post(
                    url,
                    files={"file": (filename, file_bytes, "text/csv")},
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.TimeoutException:
            raise VehicleClientError(
                f"vehicle-manager timed out importing Fuelio CSV"
            )
        except httpx.ConnectError:
            raise VehicleClientError(
                f"Could not connect to vehicle-manager at {self.base_url}. "
                "Is the service running?"
            )
        except httpx.HTTPStatusError as e:
            detail = e.response.json().get("detail", "Import failed")
            from fastapi import HTTPException as FastAPIHTTPException
            raise FastAPIHTTPException(
                status_code=e.response.status_code, detail=detail
            )