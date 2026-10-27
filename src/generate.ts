#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { renderPdf } from "./pdf.ts";
import { renderCover, renderBody } from "./render.ts";
import { SUPPORTED_LANGS, availableLangs, isLang } from "./i18n.ts";
import { validate } from "./validate.ts";
import { loadBrand, BRAND_DIR } from "./brand.ts";
import type { Edition, Lang, Report } from "./types.ts";

const ROOT = join(import.meta.dirname, "..");

const USAGE = `
seo-report — white-label multilingual PDF SEO audits

  npm run report -- <report>            generate in the report's source language
  npm run report -- <report> --lang et  generate in Estonian
  npm run report -- <report> --all      generate every translated language
  npm run report -- <report> --express  the short free excerpt instead of the full report

Arguments
  <report>          slug (looked up in reports/<slug>.json) or a path to a JSON file

Options
  --lang, -l <code> ${SUPPORTED_LANGS.join(" | ")}   (repeatable)
  --all             every language the report is actually translated into
  --out, -o <dir>   output directory (default: out/)
  --express         express edition: summary, scores and the top findings only
  --html            also write the intermediate HTML, for debugging layout
  --help, -h

Branding comes from brand/brand.json (or the folder in $BRAND_DIR).

Examples
  npm run report -- example-com--home --all
  npm run report -- example-com--home --lang et --lang ru
  npm run report -- ./reports/example-com--home.json -o ~/Desktop
`;

interface Options {
  help?: boolean;
  langs: string[];
  out: string;
  all: boolean;
  html: boolean;
  edition: Edition;
  input: string | null;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { langs: [], out: join(ROOT, "out"), all: false, html: false, edition: "full", input: null };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") return { ...opts, help: true };
    else if (a === "--all" || a === "--all-langs") opts.all = true;
    else if (a === "--html") opts.html = true;
    else if (a === "--express") opts.edition = "express";
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

/** Local date as YYYY-MM-DD: the day the PDF was rendered, not the audit date. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `<base>.pdf`, or `<base>_1.pdf`, `<base>_2.pdf`… so a re-render never overwrites a PDF already sent. */
function nextFreeName(dir: string, base: string, ext: string): string {
  let file = join(dir, `${base}${ext}`);
  for (let n = 1; existsSync(file); n++) file = join(dir, `${base}_${n}${ext}`);
  return file;
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
    const pdf = await renderPdf(report, lang, opts.edition);
    const kind = opts.edition === "express" ? "SEO-Express-Audit" : "SEO-Audit";
    const file = nextFreeName(opts.out, `${kind}-${slug}-${lang}-${today()}`, ".pdf");
    writeFileSync(file, pdf);

    const kb = (pdf.length / 1024).toFixed(0);
    console.log(`  ✓ ${lang}  ${file}  (${kb} KB, ${Date.now() - started} ms)`);

    if (opts.html) {
      const tag = opts.edition === "express" ? "-express" : "";
      writeFileSync(join(opts.out, `${slug}-${lang}${tag}-cover.html`), renderCover(report, lang, undefined, opts.edition));
      writeFileSync(join(opts.out, `${slug}-${lang}${tag}-body.html`), renderBody(report, lang, undefined, opts.edition));
    }
  }
}

main().catch((err: Error) => {
  console.error(`\n${err.message}\n`);
  process.exit(1);
});
