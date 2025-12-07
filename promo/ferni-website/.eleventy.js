const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

module.exports = function (eleventyConfig) {
  // Syntax highlighting for code blocks
  eleventyConfig.addPlugin(syntaxHighlight);

  // ============================================
  // PASSTHROUGH COPY - Static files to _site
  // ============================================

  // Root-level HTML pages (the beautiful Apple-inspired pages)
  eleventyConfig.addPassthroughCopy('index.html');
  eleventyConfig.addPassthroughCopy('team.html');
  eleventyConfig.addPassthroughCopy('pricing.html');
  eleventyConfig.addPassthroughCopy('contact.html');
  eleventyConfig.addPassthroughCopy('blog.html');
  eleventyConfig.addPassthroughCopy('privacy.html');
  eleventyConfig.addPassthroughCopy('terms.html');
  eleventyConfig.addPassthroughCopy('accessibility.html');
  eleventyConfig.addPassthroughCopy('cookies.html');
  eleventyConfig.addPassthroughCopy('404.html');
  eleventyConfig.addPassthroughCopy('platform.html');
  eleventyConfig.addPassthroughCopy('press.html');
  eleventyConfig.addPassthroughCopy('links.html');
  eleventyConfig.addPassthroughCopy('blog-template.html');

  // Root-level CSS, JS, videos
  eleventyConfig.addPassthroughCopy('css'); // Includes cookie-banner.css
  eleventyConfig.addPassthroughCopy('js');
  eleventyConfig.addPassthroughCopy('videos');

  // Images - copy specific items (excluding large sequence folder - we use video instead)
  eleventyConfig.addPassthroughCopy('images/*.jpg');
  eleventyConfig.addPassthroughCopy('images/*.png');
  eleventyConfig.addPassthroughCopy('images/generated');
  eleventyConfig.addPassthroughCopy('images/avatars');
  eleventyConfig.addPassthroughCopy('images/stock-lifestyle');
  eleventyConfig.addPassthroughCopy('images/testimonials');

  // Developers directory
  eleventyConfig.addPassthroughCopy('developers');

  // SEO files
  eleventyConfig.addPassthroughCopy('robots.txt');
  eleventyConfig.addPassthroughCopy('sitemap.xml');
  eleventyConfig.addPassthroughCopy('firebase.json');

  // PWA files
  eleventyConfig.addPassthroughCopy('manifest.json');
  eleventyConfig.addPassthroughCopy('sw.js');

  // Watch for changes
  eleventyConfig.addWatchTarget('css/');
  eleventyConfig.addWatchTarget('js/');
  eleventyConfig.addWatchTarget('*.html');

  // Add current year filter
  eleventyConfig.addFilter('year', () => new Date().getFullYear());

  // Add navigation highlight helper
  eleventyConfig.addFilter('isActive', (url, currentUrl) => {
    return url === currentUrl ? 'active' : '';
  });

  // Developer docs collection (sorted by order)
  eleventyConfig.addCollection('docs', function (collectionApi) {
    return collectionApi
      .getFilteredByGlob('src/developers/*.md')
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99));
  });

  return {
    dir: {
      input: '.', // Use root directory as input
      output: '_site',
      includes: 'src/_includes',
      data: 'src/_data',
    },
    templateFormats: ['njk', 'md', 'html'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: false, // Don't process root HTML files as templates
  };
};
