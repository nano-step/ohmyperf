import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Report } from "@ohmyperf/core";
import { renderReportHtml } from "./render.js";

function loadFixture(name: string): Report {
  const path = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Report;
}

function bodyOnly(html: string): string {
  const bodyStart = html.indexOf("<body>");
  return bodyStart === -1 ? html : html.slice(bodyStart);
}

describe("viewer renders against committed fixtures", () => {
  it("good.json renders empty-state cards for resources + audits + plugin data; CWV all green", () => {
    const html = renderReportHtml(loadFixture("good.json"));
    const body = bodyOnly(html);
    expect(body).toMatch(/<article class="cwv-card[^"]*" data-cwv-status="good"/);
    expect(body).not.toMatch(/<article class="cwv-card[^"]*" data-cwv-status="poor"/);
    expect(html).toContain("Performance Report");
    expect(body).toMatch(/empty-state/);
    expect(body).toMatch(/data-tone="success"|data-tone="info"/);
  });

  it("rich.json renders every locked section", () => {
    const html = renderReportHtml(loadFixture("rich.json"));
    const body = bodyOnly(html);
    expect(html).toContain("Performance Report");
    expect(body).toMatch(/<article class="cwv-card[^"]*" data-cwv-status="needs-improvement"/);
    expect(body).toMatch(/<article class="cwv-card[^"]*" data-cwv-status="poor"/);
    expect(body).toContain("Third parties");
    expect(body).toContain("Google Tag Manager");
    expect(body).toContain("Audits");
    expect(body).toContain("Resources");
    expect(body).toContain("class=\"third-parties\"");
  });

  it("broken.json renders without throwing and shows empty states", () => {
    expect(() => renderReportHtml(loadFixture("broken.json"))).not.toThrow();
    const html = renderReportHtml(loadFixture("broken.json"));
    expect(html).toContain("Performance Report");
    expect(html).toMatch(/empty-state/);
    expect(html).toContain("Third-party scripts not measured");
  });

  it("theme=dark forces theme-dark class on html element", () => {
    const html = renderReportHtml(loadFixture("good.json"), { theme: "dark" });
    expect(html).toMatch(/<html[^>]*class="theme-dark"/);
  });

  it("theme=light forces theme-light class", () => {
    const html = renderReportHtml(loadFixture("good.json"), { theme: "light" });
    expect(html).toMatch(/<html[^>]*class="theme-light"/);
  });

  it("theme=system (default) emits no theme class", () => {
    const html = renderReportHtml(loadFixture("good.json"));
    expect(html).toMatch(/<html lang="en">/);
  });
});
