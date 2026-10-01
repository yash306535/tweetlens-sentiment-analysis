// Screenshots of every page at 1440px and 390px wide, in both themes.
//
//   node scripts/screenshots.mjs                 every page
//   node scripts/screenshots.mjs analyze arena   just these
//
// Needs the app running: `make serve` (port 8000) or `make dev` (port 5173).
// Set BASE_URL to point elsewhere.

import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = process.env.OUT_DIR ?? "screenshots";
const WIDTHS = [1440, 390];
const THEMES = ["light", "dark"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RECIPES = {
  analyze: {
    path: "/",
    async prepare(page) {
      await page.getByPlaceholder("Paste a tweet, or write one").fill(
        "@united Thanks for NOTHING!!! Flight delayed AGAIN 😡 #NeverFlyingUnitedAgain https://t.co/x",
      );
      await page.getByRole("button", { name: "Test this tweet" }).click();
      await page.getByText("Pipeline x-ray").waitFor();
      await sleep(1500);
      for (let i = 0; i < 2; i++) {
        await page.getByRole("button", { name: "Next stage" }).click();
        await sleep(800);
      }
      await page.getByRole("button", { name: "Why this prediction?" }).click();
      await sleep(3500);
    },
  },
  "analyze-empty": {
    path: "/",
    async prepare() {
      await sleep(600);
    },
  },
  arena: {
    path: "/arena",
    async prepare(page) {
      await page.getByRole("button", { name: "Negation" }).click();
      await sleep(2200);
    },
  },
  robustness: {
    path: "/robustness",
    async prepare(page) {
      await page.getByRole("table").first().waitFor();
      await sleep(800);
    },
  },
  pulse: {
    path: "/pulse",
    async prepare(page) {
      await sleep(9000);
    },
  },
  bulk: {
    path: "/bulk",
    async prepare(page) {
      await page.getByRole("button", { name: /Try 1,200 airline tweets/ }).click();
      await page.getByText("Mood barcode").waitFor({ timeout: 20000 });
      await sleep(1200);
    },
  },
  "bulk-empty": {
    path: "/bulk",
    async prepare() {
      await sleep(500);
    },
  },
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(RECIPES);
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
for (const name of names) {
  const recipe = RECIPES[name];
  if (!recipe) {
    console.error(`No recipe called ${name}. Choose from: ${Object.keys(RECIPES).join(", ")}`);
    continue;
  }
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width > 700 ? 900 : 844 },
        deviceScaleFactor: 1,
        colorScheme: theme,
      });
      await context.addInitScript((t) => {
        localStorage.setItem("tweetlens-theme", t);
        sessionStorage.setItem("tweetlens-demo-played", "1");
      }, theme);
      const page = await context.newPage();
      page.on("pageerror", (err) => console.error(`[${name} ${theme} ${width}] page error:`, err.message));
      await page.goto(BASE + recipe.path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await recipe.prepare(page);
      // Sticky elements are drawn where the scroll position leaves them.
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(150);
      const file = `${OUT}/${name}-${width}-${theme}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      await context.close();
    }
  }
}
await browser.close();
