"""Bound reusable MLX allocations in Sector 7's owned Phonon process."""
import importlib
import os
from pathlib import Path
import sys


def cap_mlx_cache() -> None:
    try:
        import mlx.core as mx
    except ModuleNotFoundError as error:
        if error.name == "mlx" or (error.name or "").startswith("mlx."):
            print("sector7: cache hook loaded (no MLX)", file=sys.stderr, flush=True)
            return
        raise
    limit = getattr(mx, "set_cache_limit", None) or mx.metal.set_cache_limit
    limit(256 * 1024 * 1024)
    print("sector7: MLX cache limit 256 MiB", file=sys.stderr, flush=True)


try:
    cap_mlx_cache()
except Exception as error:
    print(f"sector7: MLX cache limit failed: {error}", file=sys.stderr, flush=True)
    # Python otherwise logs sitecustomize exceptions and continues without the cap.
    os._exit(70)

# Preserve a user/conda startup hook shadowed by this directory on PYTHONPATH.
original_path = sys.path[:]
this_hook = sys.modules.pop("sitecustomize")
try:
    hook_dir = Path(__file__).resolve().parent
    sys.path[:] = [entry for entry in sys.path if Path(entry).resolve() != hook_dir]
    try:
        importlib.import_module("sitecustomize")
    except ModuleNotFoundError as error:
        if error.name != "sitecustomize":
            raise
        sys.modules["sitecustomize"] = this_hook
finally:
    sys.path[:] = original_path
