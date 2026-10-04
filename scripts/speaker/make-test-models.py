#!/usr/bin/env python3
"""Write the two tiny ONNX models the speaker-embedding worker tests use.

- waveform-contract.onnx: input `waveform` [batch, samples] -> output
  `embedding` [batch, 192] = the first 192 samples, L2-normalized. Tests can
  predict its output exactly, so a result proves the neural path ran.
- mel-contract.onnx: input `mel_spectrogram` [batch, 80, time] (the old
  ferni-speaker contract). The worker must refuse it and use DSP.

Usage: python3 scripts/speaker/make-test-models.py   (needs `pip install onnx`)
"""

import os

import onnx
from onnx import TensorProto, helper

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "src", "services", "voice", "__tests__", "fixtures")


def i64(name, values):
    return helper.make_tensor(name, TensorProto.INT64, [len(values)], values)


def save(graph, name):
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], producer_name="ferni-test")
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, os.path.join(OUT, name))


waveform = helper.make_graph(
    [
        helper.make_node("Slice", ["waveform", "starts", "ends", "axes"], ["head"]),
        helper.make_node("ReduceL2", ["head"], ["norm"], axes=[1], keepdims=1),
        helper.make_node("Div", ["head", "norm"], ["embedding"]),
    ],
    "waveform_contract",
    [helper.make_tensor_value_info("waveform", TensorProto.FLOAT, ["batch", "samples"])],
    [helper.make_tensor_value_info("embedding", TensorProto.FLOAT, ["batch", 192])],
    [i64("starts", [0]), i64("ends", [192]), i64("axes", [1])],
)

mel = helper.make_graph(
    [helper.make_node("ReduceMean", ["mel_spectrogram"], ["embedding"], axes=[2], keepdims=0)],
    "mel_contract",
    [helper.make_tensor_value_info("mel_spectrogram", TensorProto.FLOAT, ["batch", 80, "time"])],
    [helper.make_tensor_value_info("embedding", TensorProto.FLOAT, ["batch", 80])],
)

os.makedirs(OUT, exist_ok=True)
save(waveform, "waveform-contract.onnx")
save(mel, "mel-contract.onnx")
print("wrote", OUT)
