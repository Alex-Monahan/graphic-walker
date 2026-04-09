import { test, expect } from "@playwright/test";

// MotherDuck WASM connection can take a while
test.setTimeout(120_000);

test.describe("Graphic Walker MotherDuck Dive", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for MotherDuck connection and database list to load
    await expect(page.getByTestId("db-select")).toBeVisible({
      timeout: 60_000,
    });
  });

  test("1. Loads database list on startup", async ({ page }) => {
    const dbSelect = page.getByTestId("db-select");
    const options = await dbSelect.locator("option").allTextContents();
    // Should have the placeholder + multiple databases
    expect(options.length).toBeGreaterThan(3);
    // Check that known databases appear
    expect(options).toContain("sample_data");
    expect(options).toContain("my_db");
  });

  test("2. Selecting sample_data loads tables with schemas", async ({
    page,
  }) => {
    await page.getByTestId("db-select").selectOption("sample_data");

    const tableSelect = page.getByTestId("table-select");
    await expect(tableSelect).toBeEnabled({ timeout: 30_000 });
    const options = await tableSelect.locator("option").allTextContents();
    // sample_data tables are in non-main schemas
    expect(options).toContain("nyc.taxi");
    expect(options).toContain("hn.hacker_news");
    expect(options).toContain("who.ambient_air_quality");
  });

  test("3. Loads ambient_air_quality table and shows GW with correct counts", async ({
    page,
  }) => {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByTestId("table-select").selectOption("who.ambient_air_quality");
    await page.getByTestId("explore-btn").click();

    // Wait for GW to render
    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });

    const info = page.getByTestId("table-info");
    await expect(info).toContainText("40,098 rows");
    await expect(info).toContainText("20 columns");
  });

  test("4. Loads taxi table (large dataset, capped at 50k rows)", async ({
    page,
  }) => {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByTestId("table-select").selectOption("nyc.taxi");
    await page.getByTestId("explore-btn").click();

    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });

    // Taxi table has >3M rows but we cap at 50k
    const info = page.getByTestId("table-info");
    await expect(info).toContainText("50,000 rows");
    await expect(info).toContainText("19 columns");
  });

  test("5. GW renders field pills for air quality data", async ({ page }) => {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page
      .getByTestId("table-select")
      .selectOption("who.ambient_air_quality");
    await page.getByTestId("explore-btn").click();

    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });

    // GW should show field pills with column names
    const gw = page.getByTestId("gw-container");
    // Dimension fields (nominal) - use .first() since GW can show pills in multiple areas
    await expect(gw.getByText("country_name").first()).toBeVisible({
      timeout: 30_000,
    });
    // Measure fields (quantitative)
    await expect(gw.getByText("pm25_concentration").first()).toBeVisible();
  });

  test("6. GW container has substantial rendered content", async ({
    page,
  }) => {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page
      .getByTestId("table-select")
      .selectOption("who.ambient_air_quality");
    await page.getByTestId("explore-btn").click();

    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });

    // Wait for GW to fully render
    await page.waitForTimeout(3000);

    // The container should have substantial content (not empty)
    const containerHeight = await page
      .getByTestId("gw-container")
      .evaluate((el) => el.scrollHeight);
    expect(containerHeight).toBeGreaterThan(200);
  });

  test("7. Back button returns to table picker", async ({ page }) => {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page
      .getByTestId("table-select")
      .selectOption("who.ambient_air_quality");
    await page.getByTestId("explore-btn").click();

    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });

    // Click back
    await page.getByTestId("back-btn").click();

    // Should be back at the table picker with db still selected
    await expect(page.getByTestId("db-select")).toBeVisible();
  });

  test("8. Can switch between different tables without page reload", async ({
    page,
  }) => {
    // Load air quality first
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page
      .getByTestId("table-select")
      .selectOption("who.ambient_air_quality");
    await page.getByTestId("explore-btn").click();

    await expect(page.getByTestId("table-info")).toContainText("40,098 rows", {
      timeout: 60_000,
    });

    // Go back and load a different table
    await page.getByTestId("back-btn").click();
    await expect(page.getByTestId("db-select")).toBeVisible();

    // Re-select database (back resets selection state) and pick hacker_news
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByTestId("table-select").selectOption("hn.hacker_news");
    await page.getByTestId("explore-btn").click();

    // Should show different data
    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });
    const info = page.getByTestId("table-info");
    await expect(info).toContainText("rows");
    await expect(info).toContainText("columns");
  });

  test("9. Can switch databases", async ({ page }) => {
    // First load from sample_data
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    const sampleTables = await page
      .getByTestId("table-select")
      .locator("option")
      .allTextContents();
    expect(sampleTables).toContain("nyc.taxi");

    // Switch to my_db
    await page.getByTestId("db-select").selectOption("my_db");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    const myDbTables = await page
      .getByTestId("table-select")
      .locator("option")
      .allTextContents();
    // my_db should have different tables
    expect(myDbTables).not.toContain("nyc.taxi");
    expect(myDbTables.length).toBeGreaterThan(1);
  });

  test("10. Table title shows correct database and schema", async ({
    page,
  }) => {
    await page.getByTestId("db-select").selectOption("sample_data");
    await expect(page.getByTestId("table-select")).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByTestId("table-select").selectOption("nyc.taxi");
    await page.getByTestId("explore-btn").click();

    await expect(page.getByTestId("gw-container")).toBeVisible({
      timeout: 60_000,
    });

    // Title should show database and schema
    const title = page.getByTestId("table-title");
    await expect(title).toContainText("sample_data");
    await expect(title).toContainText("nyc");
    await expect(title).toContainText("taxi");
  });
});
