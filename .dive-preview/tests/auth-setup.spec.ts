/**
 * Run with: npx playwright test --grep "authenticate" --headed --retries=0
 * Log in manually in the browser, then press any key in terminal.
 */
import { test } from "@playwright/test";
import { chromium } from "@playwright/test";

test("authenticate with MotherDuck (log in manually)", async () => {
  test.setTimeout(300_000);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://app.motherduck.com");
  console.log(">>> Log in to MotherDuck in the browser window <<<");

  // Wait until URL no longer contains auth.motherduck.com
  while (true) {
    await page.waitForTimeout(2_000);
    const url = page.url();
    if (url.includes("app.motherduck.com") && !url.includes("auth.motherduck.com")) {
      console.log("Detected app URL:", url);
      break;
    }
  }
  await page.waitForTimeout(5_000);

  await context.storageState({ path: "tests/.auth-state.json" });
  console.log("Auth state saved to tests/.auth-state.json");
  await browser.close();
});
