"""Modules that are imported only when first used."""

import importlib
import importlib.util
import sys
from types import ModuleType


def lazy_import(name: str) -> ModuleType:
    """The module ``name``; its code runs on the first attribute access instead of now.

    It is a real module in ``sys.modules``, so a later ``import`` (or a test's monkeypatch) gets the
    same object.
    """
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.find_spec(name)
    if spec is None or spec.loader is None:
        raise ModuleNotFoundError(name)
    loader = importlib.util.LazyLoader(spec.loader)
    spec.loader = loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    loader.exec_module(module)
    parent, _, child = name.rpartition(".")
    if parent:
        setattr(importlib.import_module(parent), child, module)
    return module
