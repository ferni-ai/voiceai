#!/usr/bin/env npx tsx
/**
 * Apply FTIS Category Merges
 *
 * This script applies the merge configuration to create a new training dataset
 * with merged categories for improved classification accuracy.
 *
 * Usage: npx tsx scripts/apply-ftis-merges.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// TYPES
// ============================================================================

interface TrainingExample {
  text: string;
  label: string;
}

interface MergeEntry {
  from: string[];
  description: string;
  examples: string[];
}

interface MergeConfig {
  version: string;
  description: string;
  merges: Record<string, Record<string, MergeEntry>>;
  originalCategories: number;
  mergedCategories: number;
  expectedAccuracyGain: string;
}

interface HierarchyEntry {
  id: string;
  name: string;
  fineCategories: string[];
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const modelsDir = path.join(__dirname, '..', 'models');
  const sourceDir = path.join(modelsDir, 'ftis-hierarchical');
  const outputDir = path.join(modelsDir, 'ftis-merged');

  console.log('🔄 Applying FTIS Category Merges\n');

  // Load merge config
  const mergeConfigPath = path.join(outputDir, 'merge_config.json');
  const mergeConfig: MergeConfig = JSON.parse(await fs.readFile(mergeConfigPath, 'utf-8'));

  // Build merge mapping: old label -> new label
  const mergeMap = new Map<string, string>();
  for (const [superCat, merges] of Object.entries(mergeConfig.merges)) {
    for (const [newLabel, entry] of Object.entries(merges)) {
      for (const oldLabel of entry.from) {
        mergeMap.set(oldLabel, newLabel);
        console.log(`  ${oldLabel} -> ${newLabel}`);
      }
    }
  }

  console.log(`\n📊 Total merges: ${mergeMap.size} categories -> ${new Set(mergeMap.values()).size} merged categories\n`);

  // Load and update hierarchy
  const hierarchyPath = path.join(sourceDir, 'hierarchy.json');
  const hierarchy: HierarchyEntry[] = JSON.parse(await fs.readFile(hierarchyPath, 'utf-8'));

  // Update hierarchy with merged categories
  const newHierarchy: HierarchyEntry[] = [];
  for (const entry of hierarchy) {
    const newCategories = new Set<string>();

    for (const cat of entry.fineCategories) {
      const mergedName = mergeMap.get(cat) || cat;
      newCategories.add(mergedName);
    }

    newHierarchy.push({
      id: entry.id,
      name: entry.name,
      fineCategories: Array.from(newCategories).sort(),
    });
  }

  // Save new hierarchy
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, 'hierarchy.json'),
    JSON.stringify(newHierarchy, null, 2)
  );
  console.log('✅ Saved merged hierarchy.json');

  // Process stage 2 data for each super-category
  const stage2Dir = path.join(outputDir, 'stage2');
  await fs.mkdir(stage2Dir, { recursive: true });

  let totalOriginal = 0;
  let totalMerged = 0;

  for (const superCat of hierarchy) {
    const sourceStage2 = path.join(sourceDir, 'stage2', superCat.id);
    const outputStage2 = path.join(stage2Dir, superCat.id);
    await fs.mkdir(outputStage2, { recursive: true });

    // Process each split (train, validation, test)
    for (const split of ['train.json', 'validation.json', 'test.json']) {
      try {
        const sourcePath = path.join(sourceStage2, split);
        const data: TrainingExample[] = JSON.parse(await fs.readFile(sourcePath, 'utf-8'));

        totalOriginal += data.length;

        // Apply merges - preserve original field name (query or text)
        const mergedData = data.map((ex) => ({
          query: ex.query || ex.text,
          label: mergeMap.get(ex.label) || ex.label,
        }));

        totalMerged += mergedData.length;

        // Save
        await fs.writeFile(
          path.join(outputStage2, split),
          JSON.stringify(mergedData, null, 2)
        );
      } catch (error) {
        console.error(`Error processing ${superCat.id}/${split}:`, error);
      }
    }

    // Create new label_map
    const newEntry = newHierarchy.find((h) => h.id === superCat.id);
    if (newEntry) {
      const labelMap: Record<string, number> = {};
      newEntry.fineCategories.forEach((cat, idx) => {
        labelMap[cat] = idx;
      });
      await fs.writeFile(
        path.join(outputStage2, 'label_map.json'),
        JSON.stringify(labelMap, null, 2)
      );
    }

    console.log(`  ✓ Processed ${superCat.id}`);
  }

  // Copy stage 1 data (unchanged)
  const stage1Source = path.join(sourceDir, 'stage1');
  const stage1Output = path.join(outputDir, 'stage1');
  await fs.mkdir(stage1Output, { recursive: true });

  for (const file of ['train.json', 'validation.json', 'test.json', 'label_map.json']) {
    try {
      const content = await fs.readFile(path.join(stage1Source, file));
      await fs.writeFile(path.join(stage1Output, file), content);
    } catch (error) {
      console.error(`Error copying stage1/${file}:`, error);
    }
  }
  console.log('  ✓ Copied stage1 data');

  // Update category_to_tools.json
  const categoryToToolsPath = path.join(sourceDir, 'category_to_tools.json');
  const categoryToTools: Record<string, string[]> = JSON.parse(
    await fs.readFile(categoryToToolsPath, 'utf-8')
  );

  const mergedCategoryToTools: Record<string, string[]> = {};
  for (const [cat, tools] of Object.entries(categoryToTools)) {
    const mergedCat = mergeMap.get(cat) || cat;
    const existing = mergedCategoryToTools[mergedCat] || [];
    mergedCategoryToTools[mergedCat] = [...new Set([...existing, ...tools])];
  }

  await fs.writeFile(
    path.join(outputDir, 'category_to_tools.json'),
    JSON.stringify(mergedCategoryToTools, null, 2)
  );
  console.log('✅ Saved merged category_to_tools.json');

  // Summary
  const originalCats = new Set(Object.keys(categoryToTools)).size;
  const mergedCats = new Set(Object.keys(mergedCategoryToTools)).size;

  console.log(`\n📊 Summary:`);
  console.log(`   Original categories: ${originalCats}`);
  console.log(`   Merged categories: ${mergedCats}`);
  console.log(`   Categories reduced: ${originalCats - mergedCats}`);
  console.log(`   Total examples: ${totalOriginal} -> ${totalMerged}`);
  console.log(`\n✅ Merged data saved to ${outputDir}`);
}

main().catch(console.error);
