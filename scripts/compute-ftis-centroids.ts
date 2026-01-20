#!/usr/bin/env npx tsx
/**
 * Compute Category Centroids for FTIS Gemini Fallback
 *
 * This script computes embedding centroids for each category using Gemini embeddings.
 * These centroids are used for the fallback classifier when ONNX confidence is low.
 *
 * Usage: npx tsx scripts/compute-ftis-centroids.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment FIRST
import dotenv from 'dotenv';
dotenv.config();
process.env.USE_VERTEX_AI = 'false';
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'ferni-ai';

// ============================================================================
// TYPES
// ============================================================================

interface TrainingExample {
  text?: string;
  query?: string;
  label: string;
}

interface CategoryCentroid {
  category: string;
  superCategory: string;
  centroid: number[];
  examples: number;
}

interface HierarchyEntry {
  id: string;
  name: string;
  fineCategories: string[];
}

// ============================================================================
// GOOGLE EMBEDDING API
// ============================================================================

// Use REST API directly for embeddings (more reliable than SDK)
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
const EMBEDDING_MODEL = 'text-embedding-004';

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!GOOGLE_API_KEY) {
    console.error('No GOOGLE_API_KEY found');
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Embedding error:', error);
      return null;
    }

    const data = await response.json() as { embedding: { values: number[] } };
    return data.embedding.values;
  } catch (error) {
    console.error('Embedding error:', error);
    return null;
  }
}

async function getBatchEmbeddings(texts: string[]): Promise<Array<number[] | null>> {
  // Process embeddings one at a time since batch API may not be available
  const results: Array<number[] | null> = [];
  
  for (const text of texts) {
    const embedding = await getEmbedding(text);
    results.push(embedding);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 50));
  }
  
  return results;
}

// ============================================================================
// CENTROID COMPUTATION
// ============================================================================

function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dimension = embeddings[0].length;
  const centroid = new Array(dimension).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimension; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimension; i++) {
    centroid[i] /= embeddings.length;
  }

  // Normalize
  const norm = Math.sqrt(centroid.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      centroid[i] /= norm;
    }
  }

  return centroid;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const modelsDir = path.join(__dirname, '..', 'models', 'ftis-merged');

  console.log('🧠 Computing Category Centroids for FTIS Fallback\n');

  // Load hierarchy
  const hierarchyPath = path.join(modelsDir, 'hierarchy.json');
  const hierarchy: HierarchyEntry[] = JSON.parse(await fs.readFile(hierarchyPath, 'utf-8'));

  // Build super-category lookup
  const categoryToSuper = new Map<string, string>();
  for (const entry of hierarchy) {
    for (const cat of entry.fineCategories) {
      categoryToSuper.set(cat, entry.id);
    }
  }

  const centroids: CategoryCentroid[] = [];
  const SAMPLES_PER_CATEGORY = parseInt(process.env.SAMPLES_PER_CATEGORY || '20', 10);
  const BATCH_SIZE = 10;
  
  console.log(`Using ${SAMPLES_PER_CATEGORY} samples per category\n`);

  // Process each super-category's training data
  for (const superCat of hierarchy) {
    const stage2Dir = path.join(modelsDir, 'stage2', superCat.id);

    try {
      const trainPath = path.join(stage2Dir, 'train.json');
      const trainData: TrainingExample[] = JSON.parse(await fs.readFile(trainPath, 'utf-8'));

      // Group by label
      const byLabel = new Map<string, string[]>();
      for (const ex of trainData) {
        const exText = ex.query || ex.text || '';
        if (!exText) continue;
        const texts = byLabel.get(ex.label) || [];
        texts.push(exText);
        byLabel.set(ex.label, texts);
      }

      console.log(`📁 Processing ${superCat.id} (${byLabel.size} categories)`);

      // Compute centroid for each category
      for (const [label, texts] of byLabel.entries()) {
        // Sample texts
        const sampled = texts.slice(0, SAMPLES_PER_CATEGORY);

        // Get embeddings in batches
        const embeddings: number[][] = [];

        for (let i = 0; i < sampled.length; i += BATCH_SIZE) {
          const batch = sampled.slice(i, i + BATCH_SIZE);
          const batchEmbeddings = await getBatchEmbeddings(batch);

          for (const emb of batchEmbeddings) {
            if (emb) embeddings.push(emb);
          }

          // Rate limiting
          await new Promise((r) => setTimeout(r, 200));
        }

        if (embeddings.length > 0) {
          const centroid = computeCentroid(embeddings);
          centroids.push({
            category: label,
            superCategory: superCat.id,
            centroid,
            examples: embeddings.length,
          });
          console.log(`  ✓ ${label}: ${embeddings.length} embeddings`);
        } else {
          console.log(`  ✗ ${label}: no embeddings computed`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${superCat.id}:`, error);
    }
  }

  // Save centroids
  const outputPath = path.join(modelsDir, 'category_centroids.json');
  await fs.writeFile(outputPath, JSON.stringify(centroids, null, 2));

  console.log(`\n✅ Saved ${centroids.length} category centroids to ${outputPath}`);

  // Also save a compact version (just the centroids without full vectors for inspection)
  const summary = centroids.map((c) => ({
    category: c.category,
    superCategory: c.superCategory,
    examples: c.examples,
    centroidDim: c.centroid.length,
  }));
  const summaryPath = path.join(modelsDir, 'category_centroids_summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📊 Summary saved to ${summaryPath}`);
}

main().catch(console.error);
