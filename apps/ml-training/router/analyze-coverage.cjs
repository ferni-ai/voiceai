/**
 * Analyze training data coverage vs label map
 */

const fs = require('fs');
const path = require('path');

// Read label map (758 tools)
const labelMapPath = path.join(__dirname, 'outputs/ferni-router-rich/label_map.json');
const labelMap = JSON.parse(fs.readFileSync(labelMapPath, 'utf-8'));
const allTools = Object.keys(labelMap);

// Read training data
const trainPath = path.join(__dirname, 'data/train.jsonl');
const lines = fs.readFileSync(trainPath, 'utf-8').split('\n').filter(Boolean);

// Get tools in training data
const trainedTools = new Set();
lines.forEach(line => {
  try {
    const ex = JSON.parse(line);
    (ex.selected_tools || []).forEach(tool => trainedTools.add(tool));
  } catch (e) {}
});

console.log('Label map tools:', allTools.length);
console.log('Trained tools:', trainedTools.size);
console.log('Missing tools:', allTools.length - trainedTools.size);
console.log('');

// Find missing tools
const missingTools = allTools.filter(t => {
  return trainedTools.has(t) === false;
});

// Categorize by prefix/pattern
const categories = {};
missingTools.forEach(tool => {
  // Extract category from tool name
  const match = tool.match(/^[a-z]+/);
  const category = match ? match[0] : 'other';
  if (!categories[category]) categories[category] = [];
  categories[category].push(tool);
});

// Sort categories by count
const sortedCats = Object.entries(categories)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 20);

console.log('=== Missing Tools by Category (top 20) ===');
sortedCats.forEach(([cat, tools]) => {
  console.log('');
  console.log(cat + ' (' + tools.length + ' tools):');
  tools.slice(0, 5).forEach(t => console.log('  - ' + t));
  if (tools.length > 5) console.log('  ... and ' + (tools.length - 5) + ' more');
});

// Export missing tools for data generation
const outputPath = path.join(__dirname, 'data/missing_tools.json');
fs.writeFileSync(outputPath, JSON.stringify(missingTools, null, 2));
console.log('');
console.log('Missing tools written to:', outputPath);
