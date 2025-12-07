const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function(eleventyConfig) {
  // Syntax highlighting for code blocks
  eleventyConfig.addPlugin(syntaxHighlight);
  
  // Copy static assets to output
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  
  // Watch CSS for changes
  eleventyConfig.addWatchTarget("src/css/");
  
  // Add current year filter
  eleventyConfig.addFilter("year", () => new Date().getFullYear());
  
  // Add navigation highlight helper
  eleventyConfig.addFilter("isActive", (url, currentUrl) => {
    return url === currentUrl ? 'active' : '';
  });

  // Developer docs collection (sorted by order)
  eleventyConfig.addCollection("docs", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/developers/*.md")
      .sort((a, b) => (a.data.order || 99) - (b.data.order || 99));
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};

