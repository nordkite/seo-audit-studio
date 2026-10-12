import puppeteer, { type Page } from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { renderCover, renderBody, runningTemplates } from "./render.ts";
import { loadBrand } from "./brand.ts";
import type { Lang, Report } from "./types.ts";

const A4 = { format: "A4" } as const;

/**
 * Chrome applies header/footer templates to every page and offers no way to
 * skip the first one, so a bleeding cover and numbered body pages cannot come
 * from a single pass. We render them as two documents and merge:
 *
 *   pass 1 — cover, zero margins, no running header/footer (bleeds to edge)
 *   pass 2 — body, margins reserved for the running header/footer
 *
 * Page numbers therefore count body pages only, which is also the correct
 * print convention: a cover is never folio'd.
 */
export async function renderPdf(report: Report, lang: Lang): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(renderCover(report, lang), { waitUntil: "load" });
    await fontsReady(page);
    const coverPdf = await page.pdf({
      ...A4,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const { header, footer } = runningTemplates(report, lang);
    await page.setContent(renderBody(report, lang), { waitUntil: "load" });
    await fontsReady(page);
    const bodyPdf = await page.pdf({
      ...A4,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: footer,
      // Must exceed the header/footer template heights or they clip.
      margin: { top: "20mm", right: 0, bottom: "18mm", left: 0 },
    });

    return await merge([coverPdf, bodyPdf], report, lang);
  } finally {
    await browser.close();
  }
}

/**
 * A brand webfont is decoded when text first asks for it, which can land after
 * the load event. Printing before that silently sets the page in the fallback
 * font.
 */
async function fontsReady(page: Page): Promise<void> {
  await page.evaluate("document.fonts.ready.then(() => true)");
}

async function merge(parts: Uint8Array[], report: Report, lang: Lang): Promise<Buffer> {
  const out = await PDFDocument.create();

  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }

  // White-label all the way down: a client opening Document Properties sees
  // the brand, not the tool that made the file.
  const { name } = loadBrand();
  const { site, clientName, auditedAt } = report.meta;
  out.setTitle(`SEO Audit — ${site} (${lang.toUpperCase()})`);
  out.setAuthor(name);
  out.setCreator(name);
  out.setProducer(name);
  out.setSubject(`SEO audit report for ${clientName}`);
  out.setKeywords(["SEO", "audit", site, clientName]);
  out.setCreationDate(new Date(`${auditedAt}T00:00:00Z`));
  out.setLanguage(lang);

  return Buffer.from(await out.save());
}
