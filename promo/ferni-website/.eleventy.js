const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

module.exports = function (eleventyConfig) {
  // Syntax highlighting for code blocks
  eleventyConfig.addPlugin(syntaxHighlight);

  // ============================================
  // PASSTHROUGH COPY - Static files to _site
  // ============================================

  // CSS - new modular architecture from src/css
  eleventyConfig.addPassthroughCopy({'src/css': 'css'});
  
  // Legacy CSS (for backwards compatibility during migration)
  eleventyConfig.addPassthroughCopy({'css': 'css-legacy'});
  
  // JS - including new hero-demo.js
  eleventyConfig.addPassthroughCopy({'src/js': 'js'});
  
  // Audio - voice samples for landing page demo
  eleventyConfig.addPassthroughCopy({'src/audio': 'audio'});
  
  // Videos
  eleventyConfig.addPassthroughCopy({'videos': 'videos'});

  // Images - copy specific items (excluding large sequence folder - we use video instead)
  eleventyConfig.addPassthroughCopy('images/*.jpg');
  eleventyConfig.addPassthroughCopy('images/*.png');
  eleventyConfig.addPassthroughCopy('images/*.svg');
  eleventyConfig.addPassthroughCopy('images/generated');
  eleventyConfig.addPassthroughCopy('images/avatars');
  eleventyConfig.addPassthroughCopy('images/stock-lifestyle');
  eleventyConfig.addPassthroughCopy('images/testimonials');
  eleventyConfig.addPassthroughCopy('images/sequence');

  // Developers directory
  eleventyConfig.addPassthroughCopy('developers');

  // SEO files
  eleventyConfig.addPassthroughCopy('robots.txt');
  eleventyConfig.addPassthroughCopy('sitemap.xml');

  // PWA files
  eleventyConfig.addPassthroughCopy('manifest.json');
  eleventyConfig.addPassthroughCopy('sw.js');

  // Watch for changes
  eleventyConfig.addWatchTarget('css/');
  eleventyConfig.addWatchTarget('js/');
  eleventyConfig.addWatchTarget('src/');

  // ============================================
  // FILTERS
  // ============================================

  // Add current year filter
  eleventyConfig.addFilter('year', () => new Date().getFullYear());

  // Add date formatting filter
  eleventyConfig.addFilter('date', (dateObj, format) => {
    if (!dateObj) return '';
    const date = new Date(dateObj);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    if (format === 'MMMM d, yyyy') {
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    } else if (format === 'MMM d, yyyy') {
      return `${monthsShort[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
    return date.toLocaleDateString();
  });

  // Truncate filter for excerpts
  eleventyConfig.addFilter('truncate', (str, length) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.slice(0, length) + '...';
  });

  // URL encode filter
  eleventyConfig.addFilter('urlencode', (str) => {
    return encodeURIComponent(str || '');
  });

  // Add navigation highlight helper
  eleventyConfig.addFilter('isActive', (url, currentUrl) => {
    return url === currentUrl ? 'active' : '';
  });

  // Slice filter for arrays
  eleventyConfig.addFilter('slice', (arr, start, end) => {
    if (!arr) return [];
    return arr.slice(start, end);
  });

  // ============================================
  // COLLECTIONS
  // ============================================

  // Blog posts collection (sorted by date)
  eleventyConfig.addCollection('posts', function (collectionApi) {
    return collectionApi
      .getFilteredByGlob('src/blog/*.md')
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  // Team members collection
  eleventyConfig.addCollection('teamMember', function (collectionApi) {
    return collectionApi.getFilteredByGlob('src/team/*.md');
  });

  // Developer docs collection (sorted by order)
  eleventyConfig.addCollection('docs', function (collectionApi) {
    return collectionApi
      .getFilteredByGlob('src/developers/*.md')
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
