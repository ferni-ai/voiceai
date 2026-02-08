# MLX Qwen3-Omni Implementation Audit Report

**Date:** February 7, 2026  
**Scope:** Complete audit of conversion, generation, server, and config files

---

## Executive Summary

The MLX Qwen3-Omni implementation is **partially complete** with a working conversion pipeline, basic generation, and an OpenAI-compatible server. However, there are **critical issues** with MoE weight mapping, incomplete streaming support, and several TODOs/stubs that need attention.

**Overall Status:**

- ✅ **Working:** Config loading, basic conversion, non-streaming generation, server endpoints
- ⚠️ **Partial:** MoE weight mapping (has bugs), streaming (incomplete), quantization (stubbed)
- ❌ **Missing:** Proper expert stacking verification, token counting, tool calling support

---

## File-by-File Analysis

### 1. `config.py` ✅ **FULLY IMPLEMENTED**

**Status:** Complete and working

**What Works:**

- ✅ `load_thinker_config()` - Loads from HF repo or local path
- ✅ `get_text_config()` - Extracts text config from thinker_config
- ✅ Default config scaffolding for Qwen3-Omni-30B-A3B
- ✅ Proper error handling for missing configs

**Issues Found:**

- ⚠️ **Line 79:** Returns `DEFAULT_THINKER_TEXT_CONFIG` if `text_config` missing - should validate required fields
- ⚠️ No validation that loaded config matches expected structure

**Recommendations:**

- Add schema validation for thinker_config structure
- Validate required fields (num_layers, num_experts, etc.) before returning

---

### 2. `convert_weights.py` ⚠️ **MOSTLY IMPLEMENTED** (Critical MoE Bug)

**Status:** Core conversion works, but **MoE expert stacking has a critical bug**

**What Works:**

- ✅ Model download from HuggingFace
- ✅ Safetensors loading (multi-shard support)
- ✅ Key mapping from HF to MLX format
- ✅ Config saving and tokenizer copying
- ✅ Quantization framework (4-bit/8-bit)
- ✅ Verification checks
- ✅ Progress logging

**Critical Bug - MoE Expert Stacking (Lines 147-180):**

```python
def stack_experts(...):
    # BUG: This function checks for experts.0 but conversion may have already happened
    if "model.layers.0.mlp.experts.0.up_proj.weight" not in weights:
        LOG.info("Experts already stacked or not present, skipping")
        return weights  # ⚠️ Silent skip - no verification!
```

**Problems:**

1. **Line 164:** Checks for `suffix in ["weight", "scales", "biases"]` but only handles `weight` in most MoE implementations
2. **Line 172:** Uses `weights.pop()` which mutates dict during iteration - could cause issues
3. **Line 174:** Stacks experts but doesn't verify all experts exist before stacking
4. **No validation:** Doesn't check if stacked shape matches expected `[num_experts, ...]` shape

**Additional Issues:**

- ⚠️ **Line 377:** `map_hf_keys()` may skip weights silently - should warn about unmapped keys
- ⚠️ **Line 387:** `strict=False` in `load_weights()` hides missing weight errors
- ⚠️ **Line 392:** Quantization happens but no verification that quantized model still works
- ⚠️ **Line 102:** Parameter counting assumes dict structure - could fail on edge cases

**TODOs/Stubs:**

- None explicitly marked, but quantization verification is missing

**MoE Weight Mapping Analysis:**

The conversion handles MoE in two places:

1. **`map_hf_keys()` (lines 109-144):** Maps HF prefixes but doesn't handle MoE structure
2. **`stack_experts()` (lines 147-180):** Converts `experts.0..N` → `switch_mlp` (stacked)

**Correctness Assessment:**

- ✅ **Conceptually correct:** Stacking experts is the right approach for MLX
- ❌ **Implementation buggy:** Missing validation, silent failures, mutation during iteration
- ⚠️ **Edge cases:** Doesn't handle partial expert sets or missing experts gracefully

**Recommendations:**

1. Add validation that all `num_experts` exist before stacking
2. Verify stacked shape matches `[num_experts, hidden_size, intermediate_size]`
3. Don't mutate dict during iteration - build new dict instead
4. Add explicit error if experts are missing
5. Check for `scales` and `biases` only if quantization was used

---

### 3. `generate.py` ✅ **FULLY IMPLEMENTED** (No Streaming)

**Status:** Complete for non-streaming generation

**What Works:**

- ✅ Model and config loading
- ✅ Tokenizer loading (local or HF repo)
- ✅ Autoregressive generation loop
- ✅ Temperature sampling
- ✅ EOS token handling
- ✅ Chat template support
- ✅ KV cache management

**Issues Found:**

- ⚠️ **Line 67-74:** `generate()` function - **NO STREAMING SUPPORT**
- ⚠️ **Line 111:** Cache evaluation happens after token generation - could be optimized
- ⚠️ **Line 92:** Uses `return_tensors="np"` then converts to MLX - inefficient
- ⚠️ **Line 100:** EOS token ID fallback logic is convoluted

**Missing Features:**

- ❌ **No streaming:** Function returns complete string, no token-by-token yielding
- ❌ **No token counting:** Returns text but no token usage stats
- ❌ **No stop sequences:** Doesn't support stop token lists

**TODOs/Stubs:**

- None explicitly marked

**Recommendations:**

1. Add streaming support with `yield` for token-by-token output
2. Add token counting (prompt_tokens, completion_tokens)
3. Add stop sequence support
4. Optimize tokenizer to return MLX arrays directly

---

### 4. `server.py` ⚠️ **MOSTLY IMPLEMENTED** (Streaming Bug, Missing Features)

**Status:** OpenAI-compatible endpoints exist, but streaming has issues

**What Works:**

- ✅ FastAPI server setup
- ✅ `/health` endpoint with Metal memory stats
- ✅ `/v1/models` endpoint
- ✅ `/v1/chat/completions` non-streaming mode
- ✅ CORS middleware
- ✅ Model manager singleton
- ✅ Pydantic request validation

**Critical Bug - Streaming (Lines 204-245):**

```python
def generate_response_streaming(...):
    # BUG: Incremental decoding is inefficient and can produce wrong deltas
    full_text = tokenizer.decode(generated, skip_special_tokens=True)
    delta = full_text[len(prev_text):]  # ⚠️ String slicing on decoded text!
```

**Problems:**

1. **Line 236-237:** Decodes entire sequence each iteration - **very inefficient**
2. **Line 237:** String slicing on decoded text can break on multi-byte UTF-8 characters
3. **Line 244:** Stop sequence check happens after decoding - should check tokens
4. **No proper SSE formatting:** Missing proper `data:` prefix handling

**Additional Issues:**

- ⚠️ **Line 354-356:** Token usage always returns `-1` (not implemented)
- ⚠️ **Line 59:** `tools` parameter accepted but **not implemented** (no function calling)
- ⚠️ **Line 60:** `tool_choice` parameter ignored
- ⚠️ **Line 62:** `top_p` parameter accepted but **not used** in sampling
- ⚠️ **Line 360:** `_stream_response()` is defined inside `create_app()` - should be module-level
- ⚠️ **Line 370:** Uses `sse_starlette` but no error handling if import fails

**OpenAI Compatibility:**

| Endpoint                    | Status      | Notes                                                     |
| --------------------------- | ----------- | --------------------------------------------------------- |
| `POST /v1/chat/completions` | ⚠️ Partial  | Missing: tools, tool_choice, top_p, proper token counting |
| `GET /v1/models`            | ✅ Complete | Returns model list                                        |
| `GET /health`               | ✅ Complete | Health check with memory stats                            |
| Streaming                   | ⚠️ Buggy    | Works but inefficient and can break on UTF-8              |

**Missing OpenAI Features:**

- ❌ **Function calling:** `tools` parameter ignored
- ❌ **Token counting:** Always returns -1
- ❌ **Top-p sampling:** Parameter accepted but not used
- ❌ **Proper streaming:** Current implementation is inefficient

**TODOs/Stubs:**

- Line 59: `tools` parameter - **STUBBED** (not implemented)
- Line 354-356: Token usage - **STUBBED** (returns -1)

**Recommendations:**

1. Fix streaming to decode only new tokens, not entire sequence
2. Implement token counting using tokenizer
3. Add `top_p` sampling support
4. Implement function calling if tools are provided
5. Move `_stream_response()` to module level
6. Add proper error handling for SSE streaming failures

---

### 5. `__init__.py` ✅ **COMPLETE**

**Status:** Minimal but complete

**What Works:**

- ✅ Version declaration
- ✅ Package documentation

**Issues Found:**

- None

---

### 6. `conversion/convert_thinker.py` ⚠️ **DUPLICATE/ALTERNATIVE** (Has Issues)

**Status:** Alternative conversion script with similar bugs

**What Works:**

- ✅ Basic conversion pipeline
- ✅ Config loading
- ✅ Tokenizer saving

**Issues Found:**

- ⚠️ **Line 89:** `quantize` parameter accepted but **not implemented** (stubbed)
- ⚠️ **Line 128:** Calls `model.sanitize()` if it exists - but this is the same buggy stacking logic
- ⚠️ **Line 131:** `strict=False` hides missing weight errors
- ⚠️ **Line 57-82:** `_map_hf_to_mlx()` duplicates logic from `convert_weights.py` - code duplication

**TODOs/Stubs:**

- Line 89: `quantize` parameter - **STUBBED** (not implemented, just a flag)

**Relationship to `convert_weights.py`:**

- This appears to be an **alternative/simpler** conversion script
- Less feature-complete (no quantization, less verification)
- Should probably be consolidated or removed

**Recommendations:**

1. Remove this file and use `convert_weights.py` as the single source
2. Or document which script to use when
3. Implement quantization if keeping this script

---

### 7. `conversion/__init__.py` ✅ **COMPLETE**

**Status:** Simple re-export, complete

**What Works:**

- ✅ Exports `convert_thinker` function

**Issues Found:**

- None

---

## Cross-Cutting Issues

### MoE Weight Mapping Correctness

**Overall Assessment: ⚠️ PARTIALLY CORRECT**

The MoE conversion logic exists in two places:

1. `convert_weights.py::stack_experts()` (lines 147-180)
2. `thinker/model.py::sanitize()` (lines 80-100)

**What's Correct:**

- ✅ Concept: Stacking experts into `switch_mlp.*` format is correct for MLX
- ✅ Key mapping handles multiple HF prefix patterns
- ✅ Supports both `experts.0..N` and pre-stacked formats

**What's Wrong:**

- ❌ **No validation:** Doesn't verify all experts exist before stacking
- ❌ **Silent failures:** Returns unchanged weights if experts not found (line 155)
- ❌ **Mutation during iteration:** Uses `pop()` which modifies dict during iteration
- ❌ **Shape verification missing:** Doesn't check stacked shape matches expected
- ❌ **Quantization handling:** Assumes `scales` and `biases` exist without checking

**Critical Bug Example:**

```python
# If model has 128 experts but only experts.0..63 exist, this will:
# 1. Stack only 64 experts (silently)
# 2. Create wrong shape [64, ...] instead of [128, ...]
# 3. Model will fail at runtime with shape mismatch
```

**Recommendations:**

1. Validate all experts exist: `for e in range(num_experts): assert expert_key in weights`
2. Verify stacked shape: `assert stacked.shape[0] == num_experts`
3. Build new dict instead of mutating during iteration
4. Raise explicit error if experts missing, don't silently skip

---

### OpenAI-Compatible Endpoints

**Overall Assessment: ⚠️ PARTIALLY COMPATIBLE**

**Implemented Endpoints:**

- ✅ `GET /health` - Health check
- ✅ `GET /v1/models` - List models
- ✅ `POST /v1/chat/completions` - Chat completions (non-streaming works)

**Missing/Incomplete Features:**

| Feature          | Status     | Impact                                    |
| ---------------- | ---------- | ----------------------------------------- |
| Streaming        | ⚠️ Buggy   | Works but inefficient, can break on UTF-8 |
| Token counting   | ❌ Missing | Always returns -1                         |
| Function calling | ❌ Missing | `tools` parameter ignored                 |
| Top-p sampling   | ❌ Missing | Parameter accepted but not used           |
| Stop sequences   | ⚠️ Partial | Works but checks decoded text, not tokens |

**Compatibility Score: 60%**

**Recommendations:**

1. Fix streaming implementation (decode only new tokens)
2. Implement token counting
3. Add top-p sampling support
4. Document that function calling is not yet supported

---

### Streaming Support

**Overall Assessment: ❌ INCOMPLETE/BUGGY**

**In `generate.py`:**

- ❌ **No streaming:** Function returns complete string only

**In `server.py`:**

- ⚠️ **Streaming exists but buggy:**
  - Line 236: Decodes entire sequence each iteration (inefficient)
  - Line 237: String slicing can break on multi-byte UTF-8
  - Line 244: Stop sequence check on decoded text (should check tokens)

**What Should Happen:**

```python
# Correct streaming pattern:
for token_id in generate_tokens(...):
    delta_text = tokenizer.decode([token_id])  # Decode only new token
    yield delta_text
```

**Current Implementation:**

```python
# Wrong pattern (current):
for token_id in generate_tokens(...):
    generated.append(token_id)
    full_text = tokenizer.decode(generated)  # Decode entire sequence!
    delta = full_text[len(prev_text):]  # String slice (can break UTF-8)
    yield delta
```

**Performance Impact:**

- For 100 tokens: Decodes 1+2+3+...+100 = 5,050 tokens worth of text
- Should decode: 100 tokens (one per iteration)

**Recommendations:**

1. Decode only the new token each iteration
2. Handle UTF-8 properly (don't slice decoded strings)
3. Check stop sequences on token IDs, not decoded text
4. Add proper SSE error handling

---

## Summary of Critical Issues

### 🔴 Critical (Must Fix)

1. **MoE Expert Stacking Validation Missing** (`convert_weights.py:147-180`)
   - Doesn't verify all experts exist before stacking
   - Can silently create wrong shapes
   - **Impact:** Model may fail at runtime with shape mismatches

2. **Streaming Implementation Buggy** (`server.py:204-245`)
   - Decodes entire sequence each iteration (very inefficient)
   - String slicing can break on UTF-8
   - **Impact:** Slow performance, potential encoding errors

3. **Token Counting Not Implemented** (`server.py:354-356`)
   - Always returns -1
   - **Impact:** Breaks OpenAI API compatibility

### 🟡 High Priority (Should Fix)

4. **Quantization Stubbed** (`conversion/convert_thinker.py:89`)
   - Parameter accepted but not implemented
   - **Impact:** Users expect quantization but it doesn't work

5. **Function Calling Not Implemented** (`server.py:59`)
   - `tools` parameter accepted but ignored
   - **Impact:** Breaks OpenAI API compatibility for tool-using clients

6. **Top-p Sampling Missing** (`server.py:62`)
   - Parameter accepted but not used in sampling
   - **Impact:** Can't use top-p sampling, only temperature

### 🟢 Medium Priority (Nice to Have)

7. **Code Duplication** (`convert_weights.py` vs `conversion/convert_thinker.py`)
   - Two conversion scripts with overlapping logic
   - **Impact:** Maintenance burden, confusion about which to use

8. **Missing Error Handling** (`server.py:370`)
   - No error handling if `sse_starlette` import fails
   - **Impact:** Cryptic error if dependency missing

---

## Recommendations Priority List

### Immediate (Before Production)

1. ✅ Fix MoE expert stacking validation
2. ✅ Fix streaming to decode only new tokens
3. ✅ Implement token counting
4. ✅ Add proper error messages for missing experts

### Short Term (Next Release)

5. ✅ Implement top-p sampling
6. ✅ Document function calling as "not yet supported"
7. ✅ Consolidate conversion scripts (remove duplicate)
8. ✅ Add quantization verification

### Long Term (Future Enhancements)

9. ✅ Implement function calling
10. ✅ Add comprehensive test suite
11. ✅ Add performance benchmarks
12. ✅ Support Talker (streaming speech) - Phase 2

---

## Testing Recommendations

**Critical Tests Needed:**

1. **MoE Conversion:**
   - Test with model that has all 128 experts
   - Test with model missing some experts (should fail gracefully)
   - Verify stacked shape matches `[num_experts, hidden_size, intermediate_size]`

2. **Streaming:**
   - Test with multi-byte UTF-8 characters (emoji, Chinese, etc.)
   - Test with long sequences (1000+ tokens)
   - Verify performance (should be O(n), not O(n²))

3. **API Compatibility:**
   - Test with OpenAI SDK client
   - Test streaming with proper SSE parsing
   - Verify token counting accuracy

---

## Conclusion

The MLX Qwen3-Omni implementation is **functional for basic use cases** but has **critical bugs** that will cause issues in production. The MoE weight mapping and streaming implementation need immediate fixes before this can be considered production-ready.

**Overall Grade: C+ (Functional but needs fixes)**

**Key Strengths:**

- Clean code structure
- Good error handling in most places
- Proper MLX integration
- OpenAI-compatible API structure

**Key Weaknesses:**

- MoE conversion lacks validation
- Streaming is inefficient and buggy
- Missing OpenAI API features
- Code duplication between conversion scripts

**Estimated Fix Time:**

- Critical fixes: 2-3 days
- High priority: 1-2 days
- Full production readiness: 1-2 weeks
