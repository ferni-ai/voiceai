#!/bin/sh
# Download and unpack the public corpora and models into $1 (about 1.9 GB; 2.0 GB unpacked).
# All CC BY 4.0 except the ECAPA export (Apache-2.0). Each file is checked against its sha256.
set -eu
D=${1:?usage: fetch.sh <data-dir>}
mkdir -p "$D/raw"
get() { # url sha256 name
  for _ in 1 2 3 4 5 6 7 8 9 10; do curl -sSL -C - -o "$D/raw/$3" "$1" && break; done
  echo "$2  $D/raw/$3" | shasum -a 256 -c -
}
O=https://www.openslr.org/resources
get $O/12/dev-clean.tar.gz 76f87d090650617fca0cac8f88b9416e0ebf80350acb97b343a85fa903728ab3 dev-clean.tar.gz
get $O/12/test-clean.tar.gz 39fde525e59672dc6d1551919b1478f724438a95aa55f874b576be21967e6c23 test-clean.tar.gz
get $O/12/dev-other.tar.gz 12661c48e8c3fe1de2c1caa4c3e135193bfb1811584f11f569dd12645aa84365 dev-other.tar.gz
get $O/12/test-other.tar.gz d09c181bba5cf717b3dee7d4d592af11a3ee3a09e08ae025c5506f6ebe961c29 test-other.tar.gz
get $O/101/speechocean762.tar.gz 876c34b828c2ebcc35ba2ff1ba5947d50e6b0162fc4a4af91db0942422b3bdd5 speechocean762.tar.gz
for f in "$D"/raw/*.tar.gz; do tar -xzf "$f" -C "$D"; done
get https://storage.googleapis.com/ferni-public-models/speaker/ecapa-tdnn-waveform-93ccd596.onnx \
  93ccd596285b31d5debad84ab3f138d5dc1145f19c3f287b81ece65afa034fc9 ecapa.onnx
get https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/f0c48c298fd835726c27956a5d617bad7115627e/voxceleb_resnet34_LM.onnx \
  7bb2f06e9df17cdf1ef14ee8a15ab08ed28e8d0ef5054ee135741560df2ec068 wespeaker_resnet34_LM.onnx
cp "$D/raw/ecapa.onnx" "$D/raw/wespeaker_resnet34_LM.onnx" "$D/"
rm -f "$D"/raw/*.tar.gz # keep only the unpacked corpora; delete "$D" when done
