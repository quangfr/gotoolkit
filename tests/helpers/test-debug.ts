import { Page } from "@playwright/test";

export function createStepLogger(prefix: string) {
  return (label: string, details?: unknown) => {
    if (typeof details === "undefined") {
      console.log(`[${prefix}] ${label}`);
      return;
    }
    console.log(`[${prefix}] ${label}`, details);
  };
}

export function attachPageDebugLogging(
  page: Page,
  prefix: string,
  options: { urlPattern?: RegExp } = {}
) {
  const { urlPattern = /\/v1\/shares\/|\/v1\/spaces\/|ms\.gotoolkit\.workers\.dev/i } = options;
  const logStep = createStepLogger(prefix);

  page.on("console", async message => {
    const text = message.text();
    if (!text) return;
    if (!/\[SSO Debug\]|OAuth|Popup|share|space|sync|draft|history|memo/i.test(text)) return;
    const values = await Promise.all(message.args().map(async arg => {
      try {
        return await arg.jsonValue();
      } catch {
        return arg.toString();
      }
    }));
    logStep(`browser:${message.type()}`, { text, values });
  });

  page.on("pageerror", error => {
    logStep("pageerror", { message: error.message, stack: error.stack });
  });

  page.on("request", request => {
    const url = request.url();
    if (!urlPattern.test(url)) return;
    logStep("request", { method: request.method(), url });
  });

  page.on("requestfailed", request => {
    const url = request.url();
    if (!urlPattern.test(url)) return;
    logStep("requestfailed", {
      method: request.method(),
      url,
      failure: request.failure()?.errorText || ""
    });
  });

  page.on("response", response => {
    const url = response.url();
    if (!urlPattern.test(url)) return;
    logStep("response", {
      status: response.status(),
      requestMethod: response.request().method(),
      url
    });
  });
}
