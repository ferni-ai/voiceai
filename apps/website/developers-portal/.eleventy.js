const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

module.exports = function (eleventyConfig) {
  // Syntax highlighting for code blocks
  eleventyConfig.addPlugin(syntaxHighlight);

  // Passthrough copy
  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'src/js': 'js' });
  eleventyConfig.addPassthroughCopy({ 'src/images': 'images' });

  // Watch for changes
  eleventyConfig.addWatchTarget('src/css/');
  eleventyConfig.addWatchTarget('src/js/');

  // Filters
  eleventyConfig.addFilter('year', () => new Date().getFullYear());

  // Date formatting filter
  eleventyConfig.addFilter('date', (dateObj, format) => {
    if (!dateObj) return '';
    const date = new Date(dateObj);
    const options = {};

    if (format === 'long') {
      options.year = 'numeric';
      options.month = 'long';
      options.day = 'numeric';
    } else if (format === 'short') {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    } else if (format === 'iso') {
      return date.toISOString();
    } else {
      // Default format: "Jan 15, 2026"
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    }

    return date.toLocaleDateString('en-US', options);
  });

  // JSON stringify filter for inline data
  eleventyConfig.addFilter('jsonify', (value) => JSON.stringify(value, null, 2));

  // Collections for docs
  eleventyConfig.addCollection('apiDocs', function (collectionApi) {
    return collectionApi
      .getFilteredByGlob('src/pages/api/*.md')
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99));
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
