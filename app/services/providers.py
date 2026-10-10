"""Safety checks for model providers.

An admin can point the assistant at any OpenAI-compatible service. Two things must never be possible:
sending the server's own secrets to an address the admin chose, and making the server probe its own
internal network. So:

- a provider's key must come from a variable named like "<NAME>_API_KEY";
- a provider's address is checked when it is saved AND again on every connection (so a hostname that
  later points inside the network is refused);
- redirects are never followed (an allowed server cannot bounce the request to an internal address);
- a local or office-network address is allowed only when the server owner switches
  ALLOW_LOCAL_MODEL_HOSTS on, for example to reach an Ollama computer.

One small gap remains by design: between the address check and the connection a hostname could change
again. Only super admins can set a provider, and the check runs on every request, so the window is tiny.
"""
import ipaddress
import os
import re
import socket
from urllib.parse import urlparse

import httpx

from app import config

KEY_NAME = re.compile(r"^[A-Z][A-Z0-9_]{0,60}_API_KEY$")
REQUEST_TIMEOUT = 60


def safe_api_key(env_name: str) -> str:
    """The key stored in the named environment variable, or "" when the name is empty or not allowed."""
    if not env_name or not KEY_NAME.match(env_name):
        return ""
    return os.getenv(env_name, "")


def check_host(hostname: str, port: int, scheme: str) -> None:
    """Raise ValueError unless every address this host resolves to is one we are willing to contact."""
    try:
        addresses = {ipaddress.ip_address(info[4][0]) for info in socket.getaddrinfo(hostname, port)}
    except (socket.gaierror, ValueError):
        raise ValueError(f"The address {hostname} could not be found.") from None

    for address in addresses:
        if address.is_link_local or address.is_multicast or address.is_unspecified or address.is_reserved:
            raise ValueError("That address is not allowed.")  # includes cloud metadata services at 169.254.169.254
        if (address.is_loopback or address.is_private) and not config.ALLOW_LOCAL_MODEL_HOSTS:
            raise ValueError("Addresses on this computer or a private network are switched off on this server.")
    if scheme == "http" and not all(a.is_loopback or a.is_private for a in addresses):
        raise ValueError("Use https for a service on the internet.")


def validate_provider(provider: dict, tolerate_unresolved: bool = False) -> None:
    """Raise ValueError (with a message for the admin) when a provider could leak a secret or reach inside the network.

    tolerate_unresolved lets an unchanged provider be re-saved while the server has no internet access.
    """
    env_name = provider.get("api_key_env") or ""
    if env_name and not KEY_NAME.match(env_name):
        raise ValueError('The key setting name must look like "GROQ_API_KEY": capital letters, digits and underscores, ending in _API_KEY.')

    url = urlparse(provider.get("base_url") or "")
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
        raise ValueError("The address must be a web address such as https://api.example.com/v1.")

    try:
        check_host(url.hostname, url.port or (443 if url.scheme == "https" else 80), url.scheme)
    except ValueError as error:
        if not (tolerate_unresolved and "could not be found" in str(error)):
            raise


class GuardedTransport(httpx.HTTPTransport):
    """Checks the destination of every request just before it is sent."""

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        url = request.url
        try:
            check_host(url.host, url.port or (443 if url.scheme == "https" else 80), url.scheme)
        except ValueError as error:
            raise httpx.ConnectError(str(error), request=request) from None
        return super().handle_request(request)


def make_http_client() -> httpx.Client:
    """The HTTP client used to talk to any model provider: guarded, and never following redirects."""
    return httpx.Client(transport=GuardedTransport(), follow_redirects=False, timeout=REQUEST_TIMEOUT)
