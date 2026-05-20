import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noDocumentWrite } from "./rules/no-document-write.js";
import { noSyncXhr } from "./rules/no-sync-xhr.js";
import { noLargeInlineDataUrl } from "./rules/no-large-inline-data-url.js";
import { preferLoadingLazy } from "./rules/prefer-loading-lazy.js";
import { preferFetchpriority } from "./rules/prefer-fetchpriority.js";
import { noRenderBlockingScriptInHead } from "./rules/no-render-blocking-script-in-head.js";
import { noPassiveEventViolation } from "./rules/no-passive-event-violation.js";

const jsTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const jsxTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("no-document-write", () => {
  it("runs", () => {
    jsTester.run("no-document-write", noDocumentWrite, {
      valid: [
        "document.body.appendChild(el);",
        "const x = window.document;",
        "doc.write(x);",
      ],
      invalid: [
        { code: "document.write('hi');", errors: [{ messageId: "noWrite" }] },
        { code: "document.writeln('hi');", errors: [{ messageId: "noWrite" }] },
      ],
    });
  });
});

describe("no-sync-xhr", () => {
  it("runs", () => {
    jsTester.run("no-sync-xhr", noSyncXhr, {
      valid: [
        "const xhr = new XMLHttpRequest(); xhr.open('GET', '/api', true);",
        "xhr.open('GET', '/api');",
        "fetch('/api');",
      ],
      invalid: [
        {
          code: "const xhr = new XMLHttpRequest(); xhr.open('GET', '/api', false);",
          errors: [{ messageId: "noSync" }],
        },
      ],
    });
  });
});

describe("no-passive-event-violation", () => {
  it("runs", () => {
    jsTester.run("no-passive-event-violation", noPassiveEventViolation, {
      valid: [
        "el.addEventListener('click', fn);",
        "el.addEventListener('touchstart', fn, { passive: true });",
        "el.addEventListener('wheel', fn, { passive: false });",
        "window.addEventListener('scroll', fn, { passive: true, capture: false });",
      ],
      invalid: [
        {
          code: "el.addEventListener('touchstart', fn);",
          errors: [{ messageId: "missingPassive" }],
        },
        {
          code: "el.addEventListener('wheel', fn, true);",
          errors: [{ messageId: "missingPassive" }],
        },
        {
          code: "window.addEventListener('scroll', fn, {});",
          errors: [{ messageId: "missingPassive" }],
        },
      ],
    });
  });
});

describe("no-large-inline-data-url", () => {
  it("runs", () => {
    const big = "data:image/png;base64," + "A".repeat(5000);
    jsxTester.run("no-large-inline-data-url", noLargeInlineDataUrl, {
      valid: [
        "const x = <img src='/static/hero.png' />;",
        "const x = <img src='data:image/svg+xml,small' />;",
      ],
      invalid: [
        {
          code: `const x = <img src="${big}" />;`,
          errors: [{ messageId: "tooLarge" }],
        },
        {
          code: `const x = <iframe src="${big}" />;`,
          errors: [{ messageId: "tooLarge" }],
        },
      ],
    });
  });
});

describe("prefer-loading-lazy", () => {
  it("runs", () => {
    jsxTester.run("prefer-loading-lazy", preferLoadingLazy, {
      valid: [
        "const x = <img src='/a.png' loading='lazy' />;",
        "const x = <img src='/a.png' loading='eager' />;",
        "const x = <iframe src='/a' loading='lazy' />;",
        "const x = <div />;",
      ],
      invalid: [
        {
          code: "const x = <img src='/a.png' />;",
          errors: [{ messageId: "missingLoading" }],
        },
        {
          code: "const x = <iframe src='/a' />;",
          errors: [{ messageId: "missingLoading" }],
        },
      ],
    });
  });
});

describe("prefer-fetchpriority", () => {
  it("runs", () => {
    jsxTester.run("prefer-fetchpriority", preferFetchpriority, {
      valid: [
        "const x = <img src='/a.png' loading='lazy' />;",
        "const x = <img src='/a.png' priority fetchPriority='high' />;",
        "const x = <img src='/a.png' data-hero fetchpriority='high' />;",
      ],
      invalid: [
        {
          code: "const x = <img src='/a.png' priority />;",
          errors: [{ messageId: "missingFetchPriority" }],
        },
        {
          code: "const x = <img src='/a.png' data-lcp />;",
          errors: [{ messageId: "missingFetchPriority" }],
        },
      ],
    });
  });
});

describe("no-render-blocking-script-in-head", () => {
  it("runs", () => {
    jsxTester.run("no-render-blocking-script-in-head", noRenderBlockingScriptInHead, {
      valid: [
        "const x = <script src='/a.js' async />;",
        "const x = <script src='/a.js' defer />;",
        "const x = <script src='/a.js' type='module' />;",
        "const x = <script>{`inline`}</script>;",
      ],
      invalid: [
        {
          code: "const x = <script src='/a.js' />;",
          errors: [{ messageId: "blocking" }],
        },
      ],
    });
  });
});
