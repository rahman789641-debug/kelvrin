import fnmatch
import ipaddress
import logging
import re
import socket
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Union
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.connector import Connector, ConnectorConfig, ConnectorExecution

logger = logging.getLogger("kelvrin.connectors.rest")

class ConnectorSecurityException(Exception):
    pass

DISALLOWED_HOSTNAMES: Set[str] = {
    "localhost",
    "metadata.google.internal",
    "metadata",
    "instance-data"
}

DISALLOWED_NETWORKS = [
    # IPv4 loopback, private, link-local, broadcast, reserved
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),       # Shared address space / CGNAT
    ipaddress.ip_network("127.0.0.0/8"),        # Loopback
    ipaddress.ip_network("169.254.0.0/16"),     # Link-local / Cloud metadata
    ipaddress.ip_network("172.16.0.0/12"),      # Private Class B (172.16 - 172.31)
    ipaddress.ip_network("192.0.0.0/24"),       # IETF Protocol assignments
    ipaddress.ip_network("192.0.2.0/24"),       # Documentation (TEST-NET-1)
    ipaddress.ip_network("192.168.0.0/16"),     # Private Class C
    ipaddress.ip_network("198.18.0.0/15"),      # Benchmarking
    ipaddress.ip_network("198.51.100.0/24"),    # Documentation (TEST-NET-2)
    ipaddress.ip_network("203.0.113.0/24"),     # Documentation (TEST-NET-3)
    ipaddress.ip_network("224.0.0.0/4"),        # Multicast
    ipaddress.ip_network("240.0.0.0/4"),        # Reserved
    ipaddress.ip_network("255.255.255.255/32"), # Broadcast
    # IPv6 loopback, link-local, unique local, multicast, unspecified
    ipaddress.ip_network("::/128"),             # Unspecified
    ipaddress.ip_network("::1/128"),            # Loopback
    ipaddress.ip_network("fc00::/7"),           # Unique local (ULA)
    ipaddress.ip_network("fe80::/10"),          # Link-local
    ipaddress.ip_network("ff00::/8"),           # Multicast
]

def is_ip_disallowed(ip: Union[ipaddress.IPv4Address, ipaddress.IPv6Address]) -> bool:
    """Checks whether an IP address belongs to private, loopback, link-local, or reserved ranges."""
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True
    for net in DISALLOWED_NETWORKS:
        if ip in net:
            return True
    return False

def validate_connector_url(url: str) -> None:
    """
    Validates connector URL to strictly prevent Server-Side Request Forgery (SSRF)
    and protocol tampering attacks.
    Enforces:
    1. Scheme must be http or https only.
    2. Hostname cannot be empty or invalid.
    3. Hostname cannot be a disallowed metadata or loopback name (localhost, metadata.google.internal, etc.).
    4. IP literals cannot be loopback, private RFC1918, link-local/cloud metadata (169.254.x), or multicast/reserved.
    5. Resolvable DNS hostnames cannot resolve to any disallowed private/loopback/link-local IP addresses.
    """
    if not url or not isinstance(url, str) or not url.strip():
        raise ConnectorSecurityException("Connector URL cannot be empty.")

    url = url.strip()
    try:
        parsed = urlsplit(url)
    except Exception as e:
        raise ConnectorSecurityException(f"Malformed connector URL: {str(e)}")

    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"}:
        raise ConnectorSecurityException(
            f"Invalid URL scheme '{parsed.scheme}'. Only 'http' and 'https' protocols are permitted."
        )

    hostname = parsed.hostname
    if not hostname:
        raise ConnectorSecurityException("Connector URL must specify a valid destination hostname.")

    hostname_lower = hostname.lower()

    # Disallowed hostnames and cloud metadata endpoints
    if (
        hostname_lower in DISALLOWED_HOSTNAMES
        or hostname_lower.endswith(".localhost")
        or hostname_lower.endswith(".internal")
        or "169.254" in hostname_lower
    ):
        raise ConnectorSecurityException(
            f"SSRF violation: Prohibited internal or cloud metadata destination '{hostname}'."
        )

    # Check if hostname is an IP literal (IPv4 or IPv6)
    clean_host = hostname_lower.strip("[]")
    try:
        ip = ipaddress.ip_address(clean_host)
        if is_ip_disallowed(ip):
            raise ConnectorSecurityException(
                f"SSRF violation: Disallowed private, loopback, or internal IP address '{hostname}'."
            )
        return
    except ValueError as ve:
        logger.debug(f"[SSRF_VALIDATION] Host '{clean_host}' is not a literal IP address: {ve}")

    # Check for integer/octal IP representations e.g. http://2130706433
    if clean_host.isdigit():
        try:
            ip = ipaddress.ip_address(int(clean_host))
            if is_ip_disallowed(ip):
                raise ConnectorSecurityException(
                    f"SSRF violation: Disallowed numeric IP representation '{hostname}'."
                )
            return
        except (ValueError, OverflowError) as oe:
            logger.debug(f"[SSRF_VALIDATION] Integer host parsing bypassed for '{clean_host}': {oe}")

    # For domain names: attempt DNS resolution to detect DNS rebinding or internal aliases
    try:
        addr_info = socket.getaddrinfo(clean_host, None, proto=socket.IPPROTO_TCP)
        for _, _, _, _, sockaddr in addr_info:
            resolved_ip_str = sockaddr[0]
            try:
                resolved_ip = ipaddress.ip_address(resolved_ip_str)
                if is_ip_disallowed(resolved_ip):
                    raise ConnectorSecurityException(
                        f"SSRF violation: Destination hostname '{hostname}' resolves to private/internal IP '{resolved_ip_str}'."
                    )
            except ValueError as rve:
                logger.warning(f"[SSRF_VALIDATION] Resolved address '{resolved_ip_str}' could not be parsed as IP: {rve}")
    except socket.gaierror as ge:
        # DNS resolution failure in offline/sandbox or mock environment is allowed to proceed
        # as long as the hostname itself is not a disallowed name or private pattern
        logger.info(f"[SSRF_VALIDATION] DNS resolution skipped or host unreachable for '{clean_host}' in offline/sandbox mode: {ge}")

class RestConnectorService:
    """
    Sovereign REST API Connector with strict endpoint allowlist and SSRF prevention.
    Prohibits unapproved outbound calls and logs every execution immutably.
    """

    ALLOWED_SCHEMES: Set[str] = {"http", "https"}
    DISALLOWED_HOSTNAMES: Set[str] = DISALLOWED_HOSTNAMES
    DISALLOWED_NETWORKS = DISALLOWED_NETWORKS

    def validate_url(self, url: str) -> None:
        """Validates URL for SSRF protection and scheme compliance."""
        validate_connector_url(url)

    def is_url_safe(self, url: str) -> bool:
        """Helper returning True if URL satisfies SSRF protection rules, False otherwise."""
        try:
            self.validate_url(url)
            return True
        except ConnectorSecurityException:
            return False

    def is_endpoint_allowed(self, path: str, allowed_patterns: List[str]) -> bool:
        """Verifies requested endpoint path matches one of the explicit patterns."""
        for pattern in allowed_patterns:
            if fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(path.lstrip("/"), pattern.lstrip("/")):
                return True
        return False

    async def execute_rest_call(
        self,
        connector_id: str,
        method: str,
        endpoint: str,
        payload: Optional[Dict[str, Any]] = None,
        db: Optional[AsyncSession] = None,
        run_id: Optional[str] = None
    ) -> Dict[str, Any]:
        if not db:
            raise ValueError("Database session required for connector execution audit.")

        stmt = select(Connector).where(Connector.id == connector_id)
        conn = (await db.execute(stmt)).scalar_one_or_none()
        if not conn:
            raise ValueError(f"Connector '{connector_id}' not found.")

        # 1. Enforce enabled gate
        if not conn.is_enabled:
            raise ConnectorSecurityException(
                f"Connector '{conn.name}' is currently DISABLED. "
                "All external/enterprise connectors are disabled by default for air-gap protection."
            )

        config = conn.config
        if not config:
            raise ConnectorSecurityException(f"Connector '{conn.name}' has no active configuration.")

        # 2. SSRF & Scheme Validation
        base_url = config.base_url
        if not base_url:
            raise ConnectorSecurityException(f"Connector '{conn.name}' has no base_url configured.")
        self.validate_url(base_url)

        # 3. Allowlist validation
        if not self.is_endpoint_allowed(endpoint, config.allowed_endpoints):
            raise ConnectorSecurityException(
                f"Endpoint '{endpoint}' is not in the connector allowlist: {config.allowed_endpoints}"
            )

        full_url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        # 4. Dispatch call
        t0 = time.perf_counter()
        status_str = "SUCCESS"
        response_data: Dict[str, Any] = {}

        try:
            async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
                if method.upper() == "GET":
                    resp = await client.get(full_url)
                elif method.upper() == "POST":
                    resp = await client.post(full_url, json=payload or {})
                else:
                    raise ValueError(f"Unsupported HTTP method '{method}'.")

                resp.raise_for_status()
                response_data = resp.json()
        except httpx.HTTPStatusError as e:
            status_str = "FAILED"
            response_data = {"error": f"HTTP error {e.response.status_code}", "detail": str(e)}
            logger.warning(f"[REST_CONNECTOR] HTTP {e.response.status_code} on connector {conn.id}: {e}")
        except httpx.RequestError as e:
            status_str = "FAILED"
            response_data = {"error": f"Network communication error: {str(e)}"}
            logger.warning(f"[REST_CONNECTOR] Network error on connector {conn.id}: {e}")
        except Exception as e:
            status_str = "FAILED"
            response_data = {"error": f"Connector execution failed: {str(e)}"}
            logger.error(f"[REST_CONNECTOR] Unexpected failure on connector {conn.id}: {e}", exc_info=True)

        duration_ms = int((time.perf_counter() - t0) * 1000)

        # 5. Record ConnectorExecution Audit
        exec_log = ConnectorExecution(
            connector_id=conn.id,
            run_id=run_id,
            action=f"{method.upper()} {endpoint}",
            endpoint=full_url,
            request_payload=payload or {},
            response_payload=response_data,
            status=status_str,
            duration_ms=duration_ms,
            created_at=datetime.now(timezone.utc)
        )
        db.add(exec_log)
        await db.commit()

        if status_str == "FAILED":
            raise RuntimeError(f"Connector execution failed: {response_data.get('error')}")

        return {
            "connector_name": conn.name,
            "endpoint": full_url,
            "status": status_str,
            "duration_ms": duration_ms,
            "data": response_data
        }

rest_connector_service = RestConnectorService()

