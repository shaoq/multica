const { execFileSync } = require("node:child_process");

const googleFontsOrigin = "https://fonts.googleapis.com";
const mirrorOrigin = process.env.NEXT_FONT_GOOGLE_MIRROR?.replace(/\/+$/, "");

if (!mirrorOrigin) {
  throw new Error(
    "NEXT_FONT_GOOGLE_MIRROR must be set when using google-font-mirror.cjs",
  );
}

module.exports = new Proxy(
  {},
  {
    get(_target, googleUrl) {
      if (
        typeof googleUrl !== "string" ||
        !googleUrl.startsWith(googleFontsOrigin)
      ) {
        return undefined;
      }

      const mirrorUrl = `${mirrorOrigin}${googleUrl.slice(googleFontsOrigin.length)}`;
      return execFileSync("wget", ["-q", "-O", "-", mirrorUrl], {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
      });
    },
  },
);
