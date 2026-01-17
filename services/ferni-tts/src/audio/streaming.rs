//! Audio Streaming
//!
//! Async streaming of audio chunks.

use super::{AudioChunk, AudioFormat, AudioPipeline, AudioPipelineConfig};
use crate::error::Result;
use futures::Stream;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::mpsc;

/// Streaming configuration
#[derive(Debug, Clone)]
pub struct StreamingConfig {
    /// Audio pipeline config
    pub pipeline_config: AudioPipelineConfig,

    /// Buffer capacity for stream
    pub buffer_capacity: usize,

    /// Target latency in milliseconds
    pub target_latency_ms: u32,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            pipeline_config: AudioPipelineConfig::default(),
            buffer_capacity: 16,
            target_latency_ms: 50,
        }
    }
}

/// Async audio stream
pub struct AudioStream {
    receiver: mpsc::Receiver<AudioChunk>,
    chunks_received: u32,
    total_bytes: usize,
}

impl AudioStream {
    /// Create a new audio stream with sender
    pub fn new(buffer_capacity: usize) -> (AudioStreamSender, Self) {
        let (tx, rx) = mpsc::channel(buffer_capacity);
        let sender = AudioStreamSender::new(tx);
        let stream = Self {
            receiver: rx,
            chunks_received: 0,
            total_bytes: 0,
        };
        (sender, stream)
    }

    /// Get number of chunks received
    pub fn chunks_received(&self) -> u32 {
        self.chunks_received
    }

    /// Get total bytes received
    pub fn total_bytes(&self) -> usize {
        self.total_bytes
    }
}

impl Stream for AudioStream {
    type Item = AudioChunk;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        match Pin::new(&mut self.receiver).poll_recv(cx) {
            Poll::Ready(Some(chunk)) => {
                self.chunks_received += 1;
                self.total_bytes += chunk.data.len();
                Poll::Ready(Some(chunk))
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Sender side of audio stream
pub struct AudioStreamSender {
    sender: mpsc::Sender<AudioChunk>,
    pipeline: AudioPipeline,
    chunks_sent: u32,
}

impl AudioStreamSender {
    fn new(sender: mpsc::Sender<AudioChunk>) -> Self {
        Self {
            sender,
            pipeline: AudioPipeline::default_pipeline(),
            chunks_sent: 0,
        }
    }

    /// Create with custom pipeline config
    pub fn with_config(mut self, config: AudioPipelineConfig) -> Self {
        self.pipeline = AudioPipeline::new(config);
        self
    }

    /// Send raw audio data (will be chunked)
    pub async fn send(&mut self, data: &[u8], format: AudioFormat) -> Result<u32> {
        let chunks = self.pipeline.process(data, format)?;
        let count = chunks.len() as u32;

        for chunk in chunks {
            self.sender.send(chunk).await.map_err(|_| {
                crate::error::Error::Internal {
                    message: "Audio stream receiver dropped".to_string(),
                }
            })?;
            self.chunks_sent += 1;
        }

        Ok(count)
    }

    /// Send a pre-built chunk
    pub async fn send_chunk(&mut self, chunk: AudioChunk) -> Result<()> {
        self.sender.send(chunk).await.map_err(|_| {
            crate::error::Error::Internal {
                message: "Audio stream receiver dropped".to_string(),
            }
        })?;
        self.chunks_sent += 1;
        Ok(())
    }

    /// Flush any remaining buffered data
    pub async fn flush(&mut self) -> Result<()> {
        if let Some(chunk) = self.pipeline.flush() {
            self.sender.send(chunk).await.map_err(|_| {
                crate::error::Error::Internal {
                    message: "Audio stream receiver dropped".to_string(),
                }
            })?;
            self.chunks_sent += 1;
        }
        Ok(())
    }

    /// Get chunks sent count
    pub fn chunks_sent(&self) -> u32 {
        self.chunks_sent
    }

    /// Close the stream
    pub fn close(self) {
        drop(self.sender);
    }
}

/// Builder for creating audio streams
pub struct AudioStreamBuilder {
    config: StreamingConfig,
}

impl AudioStreamBuilder {
    pub fn new() -> Self {
        Self {
            config: StreamingConfig::default(),
        }
    }

    pub fn with_sample_rate(mut self, sample_rate: u32) -> Self {
        self.config.pipeline_config.output_format.sample_rate = sample_rate;
        self
    }

    pub fn with_chunk_size(mut self, chunk_size: usize) -> Self {
        self.config.pipeline_config.chunk_size = chunk_size;
        self
    }

    pub fn with_buffer_capacity(mut self, capacity: usize) -> Self {
        self.config.buffer_capacity = capacity;
        self
    }

    pub fn with_target_latency(mut self, latency_ms: u32) -> Self {
        self.config.target_latency_ms = latency_ms;
        // Adjust chunk size based on latency target
        let bytes_per_ms = self.config.pipeline_config.output_format.bytes_per_second() / 1000;
        self.config.pipeline_config.chunk_size = bytes_per_ms * latency_ms as usize;
        self
    }

    pub fn build(self) -> (AudioStreamSender, AudioStream) {
        let (tx, rx) = mpsc::channel(self.config.buffer_capacity);
        let sender = AudioStreamSender {
            sender: tx,
            pipeline: AudioPipeline::new(self.config.pipeline_config),
            chunks_sent: 0,
        };
        let stream = AudioStream {
            receiver: rx,
            chunks_received: 0,
            total_bytes: 0,
        };
        (sender, stream)
    }
}

impl Default for AudioStreamBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::StreamExt;

    #[tokio::test]
    async fn test_stream_send_receive() {
        let (mut sender, mut stream) = AudioStream::new(8);

        // Send some data
        let data = vec![0u8; 4800]; // 100ms of audio
        sender.send(&data, AudioFormat::default()).await.unwrap();
        sender.flush().await.unwrap();
        sender.close();

        // Receive chunks
        let mut chunks = Vec::new();
        while let Some(chunk) = stream.next().await {
            chunks.push(chunk);
        }

        assert!(!chunks.is_empty(), "Should receive chunks");
        assert!(chunks.last().unwrap().is_final, "Last chunk should be final");
    }

    #[tokio::test]
    async fn test_builder() {
        let (sender, _stream) = AudioStreamBuilder::new()
            .with_sample_rate(48000)
            .with_target_latency(50)
            .build();

        assert_eq!(sender.chunks_sent(), 0);
    }
}
