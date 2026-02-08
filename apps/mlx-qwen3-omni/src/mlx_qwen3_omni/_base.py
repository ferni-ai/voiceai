"""
Minimal attention helpers: causal mask and scaled dot-product attention.
Mirrors mlx-lm base for use without importing mlx_lm.models.
"""

from __future__ import annotations

from typing import Any, Optional

import mlx.core as mx


def create_causal_mask(
    N: int,
    offset: int = 0,
    window_size: Optional[int] = None,
) -> mx.array:
    rinds = mx.arange(offset + N)
    linds = mx.arange(offset, offset + N) if offset else rinds
    linds = linds[:, None]
    rinds = rinds[None]
    mask = linds >= rinds
    if window_size is not None:
        mask = mask & (linds < rinds + window_size)
    return mask


def create_attention_mask(
    h: mx.array,
    cache: Any = None,
    window_size: Optional[int] = None,
    return_array: bool = False,
) -> Optional[mx.array | str]:
    N = h.shape[1]
    if cache is not None and hasattr(cache, "make_mask"):
        return cache.make_mask(N, return_array=return_array, window_size=window_size)
    if N == 1:
        return None
    if return_array or (window_size and N > window_size):
        return create_causal_mask(N, window_size=window_size)
    return "causal"


def scaled_dot_product_attention(
    queries: mx.array,
    keys: mx.array,
    values: mx.array,
    scale: float,
    mask: Optional[mx.array | str] = None,
    cache: Any = None,
    sinks: Optional[mx.array] = None,
) -> mx.array:
    if cache is not None and hasattr(cache, "bits"):
        raise ValueError("Quantized SDPA not implemented here")
    return mx.fast.scaled_dot_product_attention(
        queries, keys, values, scale=scale, mask=mask, sinks=sinks
    )


class KVCache:
    """Minimal KV cache for generation: concatenate keys/values, track offset."""

    def __init__(self) -> None:
        self.keys: Optional[mx.array] = None
        self.values: Optional[mx.array] = None
        self.offset = 0

    def update_and_fetch(self, keys: mx.array, values: mx.array) -> tuple[mx.array, mx.array]:
        if self.keys is None:
            self.keys = keys
            self.values = values
        else:
            self.keys = mx.concatenate([self.keys, keys], axis=-2)
            self.values = mx.concatenate([self.values, values], axis=-2)
        self.offset = self.keys.shape[-2]
        return self.keys, self.values

    def make_mask(self, N: int, return_array: bool = False, window_size: Optional[int] = None) -> Optional[mx.array | str]:
        if N == 1:
            return None
        if return_array or (window_size and N > window_size):
            return create_causal_mask(N, offset=self.offset, window_size=window_size)
        return "causal"

    @property
    def empty(self) -> bool:
        return self.keys is None
