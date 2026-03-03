"""
Registry utility for auto-discovering subclasses within a package.

Usage:
    from _utils.registry import make_registry
    from mypackage.base import BaseClass
    import mypackage.implementations as implementations_pkg

    # Get registry of class types (not instantiated)
    registry = make_registry(implementations_pkg, BaseClass)
    MyClass = registry['MyClass']
    instance = MyClass(arg1, arg2)

    # Get registry of instantiated classes
    registry = make_registry(implementations_pkg, BaseClass, init=True)
    instance = registry['MyClass']

    # Use custom attribute as index key
    registry = make_registry(implementations_pkg, BaseClass, index='name')
    instance = registry['my_custom_name']
"""

from __future__ import annotations

import importlib
import inspect
import pkgutil
from types import ModuleType
from typing import Any, Callable, Literal, TypeVar, overload

T = TypeVar("T")


@overload
def make_registry(
    package: ModuleType,
    base_class: type[T],
    *,
    index: str | None = None,
    index_formatter: Callable[[str], str] | None = None,
    init: Literal[True],
    init_args: tuple = (),
    init_kwargs: dict[str, Any] | None = None,
    exclude: set[type] | None = None,
) -> dict[str, T]: ...


@overload
def make_registry(
    package: ModuleType,
    base_class: type[T],
    *,
    index: str | None = None,
    index_formatter: Callable[[str], str] | None = None,
    init: Literal[False] = False,
    init_args: tuple = (),
    init_kwargs: dict[str, Any] | None = None,
    exclude: set[type] | None = None,
) -> dict[str, type[T]]: ...


def make_registry(
    package: ModuleType,
    base_class: type[T],
    *,
    index: str | None = None,
    index_formatter: Callable[[str], str] | None = None,
    init: bool = False,
    init_args: tuple = (),
    init_kwargs: dict[str, Any] | None = None,
    exclude: set[type] | None = None,
) -> dict[str, type[T]] | dict[str, T]:
    """
    Create a registry of subclasses found within a package.

    Args:
        package: The package module to search for subclasses.
        base_class: The base class to find subclasses of (excluded from registry).
        index: Attribute name to use as registry key. If None, uses __name__.
               For instantiated classes (init=True), this can be an instance attribute.
               For non-instantiated classes (init=False), this must be a class attribute.
        index_formatter: Optional callable to transform the index key (e.g. to_snake_case).
        init: If True, instantiate discovered classes. If False, return class types.
        init_args: Positional arguments to pass when instantiating (only used if init=True).
        init_kwargs: Keyword arguments to pass when instantiating (only used if init=True).
        exclude: Set of classes to skip (useful for abstract intermediate classes).

    Returns:
        Dictionary mapping index keys to classes or instances.

    Example:
        >>> import mypackage.plugins as plugins
        >>> from mypackage.base import Plugin
        >>> registry = make_registry(plugins, Plugin, index='name', init=True)
        >>> plugin = registry['my_plugin']
    """
    if init_kwargs is None:
        init_kwargs = {}
    if exclude is None:
        exclude = set()

    registry: dict[str, Any] = {}

    for _, module_name, _ in pkgutil.iter_modules(package.__path__):
        module = importlib.import_module(f"{package.__name__}.{module_name}")

        for _, obj in inspect.getmembers(module, inspect.isclass):
            # Must be a subclass of base_class but not the base_class itself
            if not issubclass(obj, base_class) or obj is base_class:
                continue

            # Skip explicitly excluded classes
            if obj in exclude:
                continue

            # Skip classes not defined in this module (avoid duplicates from imports)
            if obj.__module__ != module.__name__:
                continue

            if init:
                instance = obj(*init_args, **init_kwargs)
                key = _get_key(instance, index, index_formatter)
                registry[key] = instance
            else:
                key = _get_key(obj, index, index_formatter)
                registry[key] = obj

    return registry


def _get_key(
    obj: Any,
    index: str | None,
    formatter: Callable[[str], str] | None = None,
) -> str:
    """Extract the registry key from an object."""
    if index is None:
        # Default to class name
        if isinstance(obj, type):
            key = obj.__name__
        else:
            key = obj.__class__.__name__
    else:
        key = getattr(obj, index, None)
        if key is None:
            name = obj.__name__ if isinstance(obj, type) else obj.__class__.__name__
            raise AttributeError(
                f"'{name}' has no attribute '{index}' to use as registry key"
            )
        key = str(key)

    return formatter(key) if formatter else key
