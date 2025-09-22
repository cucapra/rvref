module.exports = function(eleventyConfig) {
  eleventyConfig.addFilter("bitRange", function(range) {
    if (!range) return "";
    if (typeof range === "string") return range;
    if (Array.isArray(range)) return `${range[0]}-${range[1]}`;
    return String(range);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};

