"""PyInstaller entry point for the AMBS Proposal Generator.

Responsibilities (kept intentionally small — the launcher rarely changes):
  1. Redirect stdout/stderr to a log file IMMEDIATELY on startup. When
     packaged with console=False, sys.stdout/sys.stderr are None — any write
     causes a silent crash. Rerouting them to an appdata log file fixes that
     AND gives us a debuggable trail.
  2. Apply any staged update (swap pending/ -> current/) BEFORE importing
     backend code.
  3. If first run on this machine, seed payload/current/ from the bundled
     payload shipped inside the .exe (embedded at _MEIPASS/payload).
  4. Add payload/current to sys.path and hand off to backend.main.run().
  5. Track consecutive failures; if the new payload crashes 3x in a row,
     roll back to payload/previous.

Because nearly all code lives in the payload (not the launcher), updates
never require reinstalling the .exe — they just drop in a new payload.zip.
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
import traceback
from datetime import datetime
from pathlib import Path


# --------------------------------------------------------------- appdata helpers
def _appdata_root() -> Path:
    base = Path(os.getenv("APPDATA") or (Path.home() / ".local" / "share"))
    root = base / "SolutionsAI" / "AMBSProposalGen"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _logs_dir() -> Path:
    d = _appdata_root() / "logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _current() -> Path:
    return _appdata_root() / "payload" / "current"


def _previous() -> Path:
    return _appdata_root() / "payload" / "previous"


def _pending() -> Path:
    return _appdata_root() / "payload" / "pending"


def _apply_marker() -> Path:
    return _appdata_root() / "payload" / "APPLY_ON_NEXT_BOOT"


def _crash_counter() -> Path:
    return _appdata_root() / "payload" / "boot_failures"


# --------------------------------------------------------------- stdio bootstrap
class _NullStream:
    """Fallback for when file logging can't be set up — never crash on writes."""

    def write(self, _):
        pass

    def flush(self):
        pass

    def isatty(self):
        return False


def _bootstrap_stdio_and_logging() -> logging.Logger:
    """Critical: runs before any import of uvicorn/fastapi/etc.

    PyInstaller with console=False sets sys.stdout/sys.stderr to None. Any
    write (including from uvicorn's default logger) raises and the whole
    process dies silently. Here we point them at a log file so (a) nothing
    crashes and (b) we get a paper trail for debugging."""
    log_path = _logs_dir() / "app.log"

    # Rotate if the log gets above 2 MB — simple rename-based rotation.
    try:
        if log_path.exists() and log_path.stat().st_size > 2 * 1024 * 1024:
            prev = _logs_dir() / "app.prev.log"
            if prev.exists():
                prev.unlink()
            log_path.rename(prev)
    except OSError:
        pass

    log_file = None
    try:
        log_file = open(log_path, "a", buffering=1, encoding="utf-8")
    except OSError:
        log_file = None

    if log_file is not None:
        if sys.stdout is None or not hasattr(sys.stdout, "write"):
            sys.stdout = log_file
        if sys.stderr is None or not hasattr(sys.stderr, "write"):
            sys.stderr = log_file
    else:
        # No file handle either — swap in null streams so writes don't raise.
        if sys.stdout is None:
            sys.stdout = _NullStream()
        if sys.stderr is None:
            sys.stderr = _NullStream()

    logger = logging.getLogger("ambs.launcher")
    logger.setLevel(logging.INFO)
    # Avoid duplicate handlers on respawn
    logger.handlers.clear()
    if log_file is not None:
        h = logging.StreamHandler(log_file)
        h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
        logger.addHandler(h)

    logger.info("=" * 60)
    logger.info(f"Launcher starting at {datetime.utcnow().isoformat()}Z")
    logger.info(f"Frozen: {getattr(sys, 'frozen', False)}  ·  exe: {sys.executable}")
    logger.info(f"Log file: {log_path}")
    return logger


# --------------------------------------------------------------- payload mgmt
def _bundled_payload_dir() -> Path | None:
    base = getattr(sys, "_MEIPASS", None)
    if not base:
        return None
    p = Path(base) / "payload"
    return p if p.exists() else None


def _swap_if_pending(log: logging.Logger):
    if not _apply_marker().exists() or not _pending().exists():
        return
    log.info("Applying staged update...")
    if _previous().exists():
        shutil.rmtree(_previous(), ignore_errors=True)
    if _current().exists():
        _current().rename(_previous())
    _pending().rename(_current())
    _apply_marker().unlink(missing_ok=True)
    log.info("Update applied.")


def _seed_initial_payload(log: logging.Logger):
    if _current().exists():
        return
    bundled = _bundled_payload_dir()
    if bundled is None:
        log.error("No bundled payload found — launcher is misbuilt.")
        return
    log.info(f"First-run: seeding payload from bundle {bundled}")
    _current().parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(bundled, _current())
    log.info("Payload seeded.")


def _increment_failure() -> int:
    f = _crash_counter()
    try:
        n = int(f.read_text().strip() or "0") if f.exists() else 0
    except (ValueError, OSError):
        n = 0
    n += 1
    f.write_text(str(n))
    return n


def _reset_failures():
    _crash_counter().unlink(missing_ok=True)


def _rollback(log: logging.Logger) -> bool:
    if not _previous().exists():
        return False
    log.warning("Rolling back to previous payload.")
    if _current().exists():
        shutil.rmtree(_current(), ignore_errors=True)
    _previous().rename(_current())
    return True


# --------------------------------------------------------------- entry point
def main():
    log = _bootstrap_stdio_and_logging()
    frozen = getattr(sys, "frozen", False)

    try:
        if frozen:
            _swap_if_pending(log)
            _seed_initial_payload(log)
            payload = _current()
            if not payload.exists():
                log.critical("Payload missing — cannot start.")
                sys.exit(2)
            log.info(f"Payload path: {payload}")
            sys.path.insert(0, str(payload))

        log.info("Importing backend.main...")
        from backend.main import run  # noqa: E402
        log.info("backend.main imported; calling run()...")
        run()
        log.info("Server exited cleanly.")
        _reset_failures()
    except SystemExit:
        raise
    except Exception:
        log.critical("Fatal error during startup:\n" + traceback.format_exc())
        if frozen:
            fails = _increment_failure()
            log.error(f"Consecutive boot failures: {fails}")
            if fails >= 3 and _rollback(log):
                log.warning(f"Rolled back after {fails} crashes.")
                _reset_failures()
        sys.exit(1)


if __name__ == "__main__":
    main()
