// Responsive blog images, built with @11ty/eleventy-img.
//
// Blog heroes are ~3 MB 2016x1134 PNGs shown at 350-900 px. These shortcodes
// turn each into AVIF, WebP and JPEG at a few widths, served from
// /images/blog/opt/ through a <picture> with srcset, sizes, width and height.
// Files are only re-encoded when the source changes (eleventy-img skips
// outputs that already exist), so warm rebuilds stay fast.

const path = require('path');
// v7 is ESM-only, so require() returns its namespace; the image function is `default`.
const Image = require('@11ty/eleventy-img').default;

const SOURCE_DIR = path.join(__dirname, '..', 'images', 'blog');
const OUTPUT_DIR = path.join(__dirname, '..', '_site', 'images', 'blog', 'opt');
const URL_PATH = '/images/blog/opt/';

const WIDTHS = [480, 800, 1200, 1600];
const FORMATS = ['avif', 'webp', 'jpeg'];

// The `sizes` for each place a blog image appears, from src/css/blog-page.css.
const SIZES = {
  // Featured card: full width on mobile, half of the 1200px container from 768px.
  featured: '(min-width: 1248px) 600px, (min-width: 768px) 50vw, 100vw',
  // Grid cards: 1, 2 then 3 columns in the 1200px container.
  card: '(min-width: 1248px) 384px, (min-width: 1024px) 31vw, (min-width: 640px) 48vw, 100vw',
  // Post hero: the 900px container.
  hero: '(min-width: 948px) 900px, 100vw',
};

function sourcePath(file) {
  const name = path.basename(String(file));
  return path.join(SOURCE_DIR, name);
}

function baseOptions(extra) {
  return {
    outputDir: OUTPUT_DIR,
    urlPath: URL_PATH,
    sharpJpegOptions: { quality: 78, mozjpeg: true },
    sharpWebpOptions: { quality: 75 },
    sharpAvifOptions: { quality: 50, effort: 6 },
    ...extra,
  };
}

/**
 * {% blogImage image, alt, "card", eager, className %}
 * The first above-the-fold image passes eager=true: it loads eagerly with
 * fetchpriority="high" because it is the page's LCP. Everything else is lazy.
 */
async function blogImage(file, alt, slot = 'card', eager = false, className = '') {
  const metadata = await Image(sourcePath(file), baseOptions({ widths: WIDTHS, formats: FORMATS }));
  const attributes = {
    alt: alt || '',
    sizes: SIZES[slot] || SIZES.card,
    loading: eager ? 'eager' : 'lazy',
  };
  if (eager) attributes.fetchpriority = 'high';
  else attributes.decoding = 'async';
  if (className) attributes.class = className;
  return Image.generateHTML(metadata, attributes);
}

/**
 * {% blogOgImage image %} -> absolute URL of a 1200x630 JPEG for og:image.
 */
async function blogOgImage(file, siteUrl = 'https://ferni.ai') {
  const metadata = await Image(
    sourcePath(file),
    baseOptions({
      widths: [1200],
      formats: ['jpeg'],
      filenameFormat: (id, src, width, format) => `${path.parse(src).name}-og-${id}.${format}`,
      transform: (sharp) => sharp.resize(1200, 630, { fit: 'cover' }),
    }),
  );
  return siteUrl + metadata.jpeg[0].url;
}

function registerBlogImages(eleventyConfig) {
  eleventyConfig.addNunjucksAsyncShortcode('blogImage', blogImage);
  eleventyConfig.addNunjucksAsyncShortcode('blogOgImage', blogOgImage);
}

module.exports = { registerBlogImages, blogImage, blogOgImage, SIZES };
