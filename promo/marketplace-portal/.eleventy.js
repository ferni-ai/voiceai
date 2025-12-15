const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

module.exports = function (eleventyConfig) {
  // Syntax highlighting for code blocks
  eleventyConfig.addPlugin(syntaxHighlight);

  // Passthrough copy
  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'src/js': 'js' });
  eleventyConfig.addPassthroughCopy({ 'src/images': 'images' });
  eleventyConfig.addPassthroughCopy({ 'src/audio': 'audio' });

  // Watch for changes
  eleventyConfig.addWatchTarget('src/css/');
  eleventyConfig.addWatchTarget('src/js/');

  // Filters
  eleventyConfig.addFilter('year', () => new Date().getFullYear());

  // JSON stringify filter
  eleventyConfig.addFilter('jsonify', (value) => JSON.stringify(value, null, 2));

  // Star rating filter
  eleventyConfig.addFilter('stars', (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  });

  // Collections for personas
  eleventyConfig.addCollection('personas', function (collectionApi) {
    return collectionApi.getFilteredByGlob('src/pages/persona/*.njk');
  });

  eleventyConfig.addCollection('categories', function (collectionApi) {
    return collectionApi.getFilteredByGlob('src/pages/category/*.njk');
  });

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    templateFormats: ['njk', 'md', 'html'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
};
