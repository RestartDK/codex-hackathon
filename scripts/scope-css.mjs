import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_SELECTOR = ".pbv-root";
const FILES = ["src/app/main.css", "src/app/App.css"];
const CONDITIONAL_AT_RULES = /^@(media|supports|container|layer)\b/u;
const VERBATIM_AT_RULES = /^@(keyframes|-webkit-keyframes|font-face|page|property)\b/u;

function blockBody(css, open) {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return { start: open + 1, end: index, next: index + 1 };
    }
  }
  throw new Error("Unbalanced braces.");
}

function splitSelectorList(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

function scopeSelector(selector) {
  const trimmed = selector.trim();
  if (!trimmed || trimmed.startsWith(ROOT_SELECTOR)) return trimmed;
  if (trimmed === ":root" || trimmed === "html" || trimmed === "body") return ROOT_SELECTOR;
  return `${ROOT_SELECTOR} ${trimmed}`;
}

function scopeSelectorList(selectorList) {
  return splitSelectorList(selectorList)
    .map((part) => {
      const leading = part.slice(0, part.length - part.trimStart().length);
      const trailing = part.slice(part.trimEnd().length);
      return `${leading}${scopeSelector(part)}${trailing}`;
    })
    .join(",");
}

function rewrite(css, escaped) {
  let output = "";
  let prelude = "";
  let index = 0;
  while (index < css.length) {
    const character = css[index];
    if (character !== "{") {
      prelude += character;
      index += 1;
      continue;
    }
    const leadingLength = prelude.length - prelude.trimStart().length;
    const trailingLength = prelude.length - prelude.trimEnd().length;
    const leading = prelude.slice(0, leadingLength);
    const header = prelude.slice(leadingLength, prelude.length - trailingLength);
    const trailing = prelude.slice(prelude.length - trailingLength);
    const body = blockBody(css, index);
    const content = css.slice(body.start, body.end);
    if (CONDITIONAL_AT_RULES.test(header.trim())) {
      output += `${prelude}{${rewrite(content, escaped)}}`;
    } else if (VERBATIM_AT_RULES.test(header.trim())) {
      output += `${prelude}{${content}}`;
    } else {
      output += `${leading}${scopeSelectorList(header)}${trailing}{${content}}`;
      for (const part of splitSelectorList(header)) {
        const selector = part.trim();
        if (selector && !selector.startsWith(ROOT_SELECTOR)) escaped.push(selector);
      }
    }
    prelude = "";
    index = body.next;
  }
  return output + prelude;
}

const checkOnly = process.argv.includes("--check");
const escapes = new Map();
let failed = false;

for (const relativePath of FILES) {
  const path = join(process.cwd(), relativePath);
  const original = readFileSync(path, "utf8");
  const caught = [];
  const scoped = rewrite(original, caught);
  if (checkOnly) {
    if (caught.length) {
      escapes.set(relativePath, caught);
      failed = true;
    }
    continue;
  }
  if (scoped !== original) {
    writeFileSync(path, scoped);
    console.log(`scoped ${relativePath}`);
  }
}

if (checkOnly) {
  for (const [path, selectors] of escapes) {
    console.error(`${path} escapes ${ROOT_SELECTOR}:`);
    for (const selector of selectors) console.error(`  ${selector}`);
  }
  console.log(failed ? "style isolation check failed" : `style isolation check passed`);
  process.exit(failed ? 1 : 0);
}
