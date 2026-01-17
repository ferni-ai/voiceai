/**
 * Model Loader
 *
 * Loads the ONNX router model from local filesystem or GCS.
 *
 * @module tools/intelligence/router/inference/model-loader
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { RouterModelConfig } from './types.js';

const log = createLogger({ module: 'ftis:model-loader' });

// ============================================================================
// TYPES
// ============================================================================

interface LoadedModel {
  session: unknown; // InferenceSession type
  labelMap: Record<string, number>;
  inverseLabeMap: Record<number, string>;
  version: string;
}

// ============================================================================
// MODEL LOADER
// ============================================================================

export class ModelLoader {
  private config: RouterModelConfig;
  private model: LoadedModel | null = null;

  constructor(config: RouterModelConfig) {
    this.config = config;
  }

  // ==========================================================================
  // LOADING
  // ==========================================================================

  /**
   * Load the model from configured path
   */
  async load(): Promise<LoadedModel> {
    if (this.model) {
      return this.model;
    }

    const startTime = Date.now();
    log.info({ modelPath: this.config.modelPath }, 'Loading router model');

    try {
      // Check if path is GCS URL
      if (this.config.modelPath.startsWith('gs://')) {
        return await this.loadFromGCS();
      }

      // Load from local filesystem
      return await this.loadFromLocal();
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to load router model');
      throw error;
    } finally {
      log.info({ durationMs: Date.now() - startTime }, 'Model loading complete');
    }
  }

  /**
   * Load model from local filesystem
   */
  private async loadFromLocal(): Promise<LoadedModel> {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Check if model file exists
    try {
      await fs.access(this.config.modelPath);
    } catch {
      throw new Error(`Model file not found: ${this.config.modelPath}`);
    }

    // Load ONNX Runtime dynamically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ort: any;
    try {
      ort = await import('onnxruntime-node');
    } catch {
      // Fallback to web runtime or mock for development
      log.debug('onnxruntime-node not available');
      throw new Error('ONNX Runtime not available - install onnxruntime-node');
    }

    // Create session options
    // Note: onnxruntime-node uses lowercase backend names ('cpu', 'cuda') not 'CPUExecutionProvider'
    const sessionOptions = {
      executionProviders: this.config.useGPU ? ['cuda', 'cpu'] : ['cpu'],
      graphOptimizationLevel: 'all',
    };

    // Load the model
    const session = await ort.InferenceSession.create(this.config.modelPath, sessionOptions);

    log.debug(
      {
        inputs: session.inputNames,
        outputs: session.outputNames,
      },
      'ONNX session created'
    );

    // Load label map
    const labelMap = await this.loadLabelMap();
    const inverseLabeMap: Record<number, string> = {};
    for (const [label, idx] of Object.entries(labelMap)) {
      inverseLabeMap[idx] = label;
    }

    // Get version from model path or default
    const version = this.extractVersion(this.config.modelPath);

    this.model = {
      session,
      labelMap,
      inverseLabeMap,
      version,
    };

    return this.model;
  }

  /**
   * Load model from Google Cloud Storage
   */
  private async loadFromGCS(): Promise<LoadedModel> {
    log.info('Loading model from GCS');

    const { Storage } = await import('@google-cloud/storage');
    const storage = new Storage();

    // Parse GCS URL
    const match = this.config.modelPath.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid GCS URL: ${this.config.modelPath}`);
    }

    const [, bucket, filePath] = match;
    const fs = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');

    // Download to temp directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ferni-router-'));
    const localModelPath = path.join(tempDir, 'model.onnx');

    await storage.bucket(bucket).file(filePath).download({
      destination: localModelPath,
    });

    // Also download label map if it exists
    const labelMapGCSPath = filePath.replace('.onnx', '_label_map.json');
    const localLabelMapPath = path.join(tempDir, 'label_map.json');

    try {
      await storage.bucket(bucket).file(labelMapGCSPath).download({
        destination: localLabelMapPath,
      });
      this.config.labelMapPath = localLabelMapPath;
    } catch {
      log.debug('Label map not found in GCS, using configured path');
    }

    // Update config and load
    const originalPath = this.config.modelPath;
    this.config.modelPath = localModelPath;

    try {
      const model = await this.loadFromLocal();
      model.version = this.extractVersion(originalPath);
      return model;
    } finally {
      // Cleanup temp files after loading
      // Note: In production, you might want to cache the model locally
    }
  }

  /**
   * Load label map from JSON file
   */
  private async loadLabelMap(): Promise<Record<string, number>> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(this.config.labelMapPath, 'utf-8');
      return JSON.parse(content) as Record<string, number>;
    } catch (error) {
      log.warn(
        { error: String(error), path: this.config.labelMapPath },
        'Failed to load label map'
      );
      return {};
    }
  }

  /**
   * Extract version from model path
   */
  private extractVersion(modelPath: string): string {
    // Try to extract version from path (e.g., model_v1.2.3.onnx)
    const versionMatch = modelPath.match(/v?(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      return versionMatch[1];
    }

    // Use timestamp as fallback version
    return `dev-${new Date().toISOString().split('T')[0]}`;
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Get the loaded model (or null if not loaded)
   */
  getModel(): LoadedModel | null {
    return this.model;
  }

  /**
   * Check if model is loaded
   */
  isLoaded(): boolean {
    return this.model !== null;
  }

  /**
   * Unload the model
   */
  async unload(): Promise<void> {
    if (this.model) {
      // Dispose ONNX session if it has a dispose method
      const session = this.model.session as { release?: () => void };
      if (session.release) {
        session.release();
      }
      this.model = null;
      log.info('Router model unloaded');
    }
  }

  /**
   * Reload the model
   */
  async reload(): Promise<LoadedModel> {
    await this.unload();
    return this.load();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let loaderInstance: ModelLoader | null = null;

export function getModelLoader(config?: RouterModelConfig): ModelLoader {
  if (!loaderInstance && config) {
    loaderInstance = new ModelLoader(config);
  }
  if (!loaderInstance) {
    throw new Error('Model loader not initialized');
  }
  return loaderInstance;
}

export function resetModelLoader(): void {
  if (loaderInstance) {
    loaderInstance.unload().catch(() => {});
  }
  loaderInstance = null;
}
