#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { renderPdf } from "./pdf.js";
import { SUPPORTED_LANGS, availableLangs } from "./i18n.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `
nordkite seo-report — branded multilingual PDF SEO audits

  npm run report -- <report>            generate in the report's source language
  npm run report -- <report> --lang et  generate in Estonian
  npm run report -- <report> --all      generate every translated language

Arguments
  <report>          slug (looked up in reports/<slug>.json) or a path to a JSON file

Options
  --lang, -l <code> ${SUPPORTED_LANGS.join(" | ")}   (repeatable)
  --all             every language the report is actually translated into
  --out, -o <dir>   output directory (default: out/)
  --html            also write the intermediate HTML, for debugging layout
  --help, -h

Examples
  npm run report -- naa-ee --all
  npm run report -- naa-ee --lang et --lang ru
  npm run report -- ./reports/naa-ee.json -o ~/Desktop
`;

function parseArgs(argv) {
  const opts = { langs: [], out: join(ROOT, "out"), all: false, html: false, input: null };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { help: true };
    else if (a === "--all" || a === "--all-langs") opts.all = true;
    else if (a === "--html") opts.html = true;
    else if (a === "--lang" || a === "-l") opts.langs.push(argv[++i]);
    else if (a.startsWith("--lang=")) opts.langs.push(a.slice(7));
    else if (a === "--out" || a === "-o") opts.out = resolve(argv[++i]);
    else if (a.startsWith("--out=")) opts.out = resolve(a.slice(6));
    else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else if (!opts.input) opts.input = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return opts;
}

function resolveReportPath(input) {
  const candidates = input.endsWith(".json")
    ? [resolve(input), join(ROOT, input)]
    : [join(ROOT, "reports", `${input}.json`), resolve(`${input}.json`)];

  const hit = candidates.find((p) => existsSync(p));
  if (!hit) {
    throw new Error(
      `Report not found: "${input}"\nLooked in:\n${candidates.map((c) => `  ${c}`).join("\n")}`
    );
  }
  return hit;
}

function validate(report, path) {
  const problems = [];
  if (!report.meta) problems.push("missing `meta`");
  else {
    for (const k of ["site", "clientName", "auditedAt", "score", "pagesAnalyzed"]) {
      if (report.meta[k] === undefined) problems.push(`missing \`meta.${k}\``);
    }
    const { score } = report.meta;
    if (score !== undefined && (typeof score !== "number" || score < 0 || score > 100)) {
      problems.push("`meta.score` must be a number 0–100");
    }
  }
  if (!Array.isArray(report.findings) || !report.findings.length) {
    problems.push("`findings` must be a non-empty array");
  } else {
    const valid = new Set(["critical", "warning", "opportunity", "pass"]);
    report.findings.forEach((f, i) => {
      if (!valid.has(f.severity)) {
        problems.push(`findings[${i}] (${f.id ?? "no id"}): invalid severity "${f.severity}"`);
      }
      if (!f.title) problems.push(`findings[${i}] (${f.id ?? "no id"}): missing title`);
    });
  }

  if (problems.length) {
    throw new Error(`Invalid report ${basename(path)}:\n${problems.map((p) => `  · ${p}`).join("\n")}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.input) {
    console.log(USAGE);
    process.exit(opts.input ? 0 : 1);
  }

  const path = resolveReportPath(opts.input);
  const report = JSON.parse(readFileSync(path, "utf8"));
  validate(report, path);

  const source = report.meta.sourceLang ?? "en";
  const translated = availableLangs(report);

  let langs;
  if (opts.all) langs = translated;
  else if (opts.langs.length) langs = opts.langs;
  else langs = [source];

  for (const l of langs) {
    if (!SUPPORTED_LANGS.includes(l)) {
      throw new Error(`Unsupported language "${l}". Supported: ${SUPPORTED_LANGS.join(", ")}`);
    }
    if (!translated.includes(l)) {
      console.warn(
        `  ! ${l}: report is not translated into this language yet — ` +
          `falling back to "${source}" for any missing strings. ` +
          `Run /translate-report ${report.meta.slug ?? ""} ${l} to fill it in.`
      );
    }
  }

  mkdirSync(opts.out, { recursive: true });
  const slug = report.meta.slug ?? basename(path, ".json");

  for (const lang of langs) {
    const started = Date.now();
    const pdf = await renderPdf(report, lang);
    const file = join(opts.out, `SEO-Audit-${slug}-${lang}.pdf`);
    writeFileSync(file, pdf);

    const kb = (pdf.length / 1024).toFixed(0);
    console.log(`  ✓ ${lang}  ${file}  (${kb} KB, ${Date.now() - started} ms)`);

    if (opts.html) {
      const { renderCover, renderBody } = await import("./render.js");
      writeFileSync(join(opts.out, `${slug}-${lang}-cover.html`), renderCover(report, lang));
      writeFileSync(join(opts.out, `${slug}-${lang}-body.html`), renderBody(report, lang));
    }
  }
}

main().catch((err) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
