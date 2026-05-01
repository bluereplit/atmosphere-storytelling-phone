"""
WebSocket client — asyncio event loop in a background daemon thread.
Connects to the Node.js backend, parses JSON state events, and
pushes them into a thread-safe queue consumed by the render loop.
"""
import asyncio
import json
import queue
import threading
import time
import logging

log = logging.getLogger(__name__)

RECONNECT_DELAY = 2.0  # seconds between reconnect attempts
CONNECT_TIMEOUT = 5.0  # seconds to wait for initial connection


class WSClient:
    """
    Thread-safe WebSocket client.  Call start() once; the background thread
    runs its own asyncio loop and fills event_queue with parsed dicts.
    """

    def __init__(self, url: str, event_queue: queue.Queue):
        self.url = url
        self.event_queue = event_queue
        self._connected = False
        self._last_disconnect: float | None = None
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True, name="ws-client")

    # ------------------------------------------------------------------ public

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def seconds_since_disconnect(self) -> float | None:
        """None if currently connected; elapsed seconds if disconnected."""
        if self._connected:
            return None
        if self._last_disconnect is None:
            return 9999.0  # never connected yet
        return time.monotonic() - self._last_disconnect

    # ----------------------------------------------------------------- private

    def _run(self) -> None:
        asyncio.run(self._loop())

    async def _loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self._connect_and_receive()
            except Exception as exc:
                log.debug("WS error: %s", exc)
            self._connected = False
            self._last_disconnect = time.monotonic()
            await asyncio.sleep(RECONNECT_DELAY)

    async def _connect_and_receive(self) -> None:
        import websockets  # late import so module loads even if pkg missing
        async with websockets.connect(
            self.url,
            open_timeout=CONNECT_TIMEOUT,
            ping_interval=20,
            ping_timeout=10,
        ) as ws:
            self._connected = True
            log.info("Connected to %s", self.url)
            async for raw in ws:
                try:
                    data = json.loads(raw)
                    self.event_queue.put_nowait(data)
                except (json.JSONDecodeError, queue.Full):
                    pass
