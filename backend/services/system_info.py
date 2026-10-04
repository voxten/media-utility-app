"""System hardware inspection and application storage management."""

import ctypes
import logging
import os
import platform
import shutil
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

from backend.core.paths import app_data_dir, cache_dir

logger = logging.getLogger("media_studio.system_info")


def _dir_stats(path: Path) -> Tuple[int, int]:
    """Returns (total_bytes, file_count) for a directory tree."""
    if not path.is_dir():
        return 0, 0
    total_bytes = 0
    file_count = 0
    try:
        for root, _, files in os.walk(path):
            for f in files:
                file_count += 1
                try:
                    total_bytes += Path(root, f).stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total_bytes, file_count


def get_storage_info() -> Dict[str, Any]:
    """Returns filesystem usage breakdown for Media Studio data directories."""
    app_data = app_data_dir()
    cache = cache_dir()
    models = app_data / "models"
    bin_dir = app_data / "bin"

    cache_bytes, cache_files = _dir_stats(cache)
    models_bytes, models_files = _dir_stats(models)
    bin_bytes, bin_files = _dir_stats(bin_dir)
    total_app_bytes, total_app_files = _dir_stats(app_data)

    return {
        "appDataDir": str(app_data),
        "cacheDir": str(cache),
        "modelsDir": str(models),
        "binDir": str(bin_dir),
        "cacheBytes": cache_bytes,
        "cacheFiles": cache_files,
        "modelsBytes": models_bytes,
        "modelsFiles": models_files,
        "binBytes": bin_bytes,
        "binFiles": bin_files,
        "totalAppDataBytes": total_app_bytes,
        "totalAppDataFiles": total_app_files,
    }


def clear_cache() -> Dict[str, Any]:
    """Safely removes temporary files and folders from the cache directory."""
    cache = cache_dir()
    freed_bytes = 0
    files_deleted = 0
    errors: List[str] = []

    if cache.is_dir():
        for item in cache.iterdir():
            try:
                if item.is_file() or item.is_symlink():
                    try:
                        freed_bytes += item.stat().st_size
                    except OSError:
                        pass
                    item.unlink(missing_ok=True)
                    files_deleted += 1
                elif item.is_dir():
                    b, f = _dir_stats(item)
                    shutil.rmtree(item, ignore_errors=True)
                    freed_bytes += b
                    files_deleted += f
            except Exception as e:
                errors.append(f"{item.name}: {e}")

    logger.info("Cleared cache: %s bytes freed, %s items deleted", freed_bytes, files_deleted)
    return {
        "freedBytes": freed_bytes,
        "filesDeleted": files_deleted,
        "errors": errors,
        "success": True,
    }


def _get_windows_gpus() -> List[str]:
    gpus: List[str] = []
    if sys.platform != "win32":
        return gpus
    try:
        import winreg

        key_path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path)
        for i in range(winreg.QueryInfoKey(key)[0]):
            subkey_name = winreg.EnumKey(key, i)
            if subkey_name.isdigit():
                try:
                    subkey = winreg.OpenKey(key, subkey_name)
                    desc, _ = winreg.QueryValueEx(subkey, "DriverDesc")
                    if desc and desc not in gpus:
                        gpus.append(desc)
                    winreg.CloseKey(subkey)
                except OSError:
                    pass
        winreg.CloseKey(key)
    except Exception:
        pass
    return gpus


def _get_windows_cpu_name() -> str:
    if sys.platform != "win32":
        return platform.processor() or "Unknown CPU"
    try:
        import winreg

        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
        winreg.CloseKey(key)
        return str(name).strip()
    except Exception:
        return platform.processor() or "Unknown CPU"


def _get_ram_info() -> Tuple[int, int]:
    """Returns (total_bytes, avail_bytes)."""
    if sys.platform == "win32":
        try:
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                return int(stat.ullTotalPhys), int(stat.ullAvailPhys)
        except Exception:
            pass

    return 0, 0


def get_hardware_info() -> Dict[str, Any]:
    """Collects CPU, GPU, RAM and PyTorch acceleration details."""
    cpu_name = _get_windows_cpu_name()
    cpu_threads = os.cpu_count() or 1
    cpu_arch = platform.machine()
    gpus = _get_windows_gpus()
    ram_total, ram_avail = _get_ram_info()

    cuda_available = False
    cuda_device_name = ""
    cuda_version = ""

    try:
        import torch

        cuda_available = torch.cuda.is_available()
        if cuda_available:
            cuda_device_name = torch.cuda.get_device_name(0)
            cuda_version = getattr(torch.version, "cuda", "") or ""
    except Exception:
        pass

    return {
        "cpuName": cpu_name,
        "cpuThreads": cpu_threads,
        "cpuArchitecture": cpu_arch,
        "gpus": gpus,
        "cudaAvailable": cuda_available,
        "cudaDeviceName": cuda_device_name,
        "cudaVersion": cuda_version,
        "ramTotalBytes": ram_total,
        "ramAvailBytes": ram_avail,
        "osName": f"{platform.system()} {platform.release()}",
    }
