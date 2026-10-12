#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { renderPdf } from "./pdf.ts";
import { renderCover, renderBody } from "./render.ts";
import { SUPPORTED_LANGS, availableLangs, isLang } from "./i18n.ts";
import { validate } from "./validate.ts";
import { loadBrand, BRAND_DIR } from "./brand.ts";
import type { Lang, Report } from "./types.ts";

const ROOT = join(import.meta.dirname, "..");

const USAGE = `
seo-report — white-label multilingual PDF SEO audits

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

Branding comes from brand/brand.json (or the folder in $BRAND_DIR).

Examples
  npm run report -- naa-ee --all
  npm run report -- naa-ee --lang et --lang ru
  npm run report -- ./reports/naa-ee.json -o ~/Desktop
`;

interface Options {
  help?: boolean;
  langs: string[];
  out: string;
  all: boolean;
  html: boolean;
  input: string | null;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { langs: [], out: join(ROOT, "out"), all: false, html: false, input: null };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { ...opts, help: true };
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

function resolveReportPath(input: string): string {
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help || !opts.input) {
    console.log(USAGE);
    process.exit(opts.input ? 0 : 1);
  }

  const path = resolveReportPath(opts.input);
  const report: Report = JSON.parse(readFileSync(path, "utf8"));
  validate(report, path);

  // Load once up front so a broken brand.json fails before Chrome starts.
  if (loadBrand().isExample) {
    console.warn(
      `  ! No brand config at ${join(BRAND_DIR, "brand.json")} — using the example brand.\n` +
        `    Run \`npm run setup\` or copy brand.example/ to brand/ and edit it.`
    );
  }

  const source = report.meta.sourceLang ?? "en";
  const translated = availableLangs(report);

  let requested: string[];
  if (opts.all) requested = translated;
  else if (opts.langs.length) requested = opts.langs;
  else requested = [source];

  const langs: Lang[] = [];
  for (const l of requested) {
    if (!isLang(l)) {
      throw new Error(`Unsupported language "${l}". Supported: ${SUPPORTED_LANGS.join(", ")}`);
    }
    if (!translated.includes(l)) {
      console.warn(
        `  ! ${l}: report is not translated into this language yet — ` +
          `falling back to "${source}" for any missing strings. ` +
          `Run /translate-report ${report.meta.slug ?? ""} ${l} to fill it in.`
      );
    }
    langs.push(l);
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
      writeFileSync(join(opts.out, `${slug}-${lang}-cover.html`), renderCover(report, lang));
      writeFileSync(join(opts.out, `${slug}-${lang}-body.html`), renderBody(report, lang));
    }
  }
}

main().catch((err: Error) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
