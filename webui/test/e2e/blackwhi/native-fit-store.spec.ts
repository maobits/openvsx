/* SPDX-License-Identifier: EPL-2.0
 * BlackWhi Store — native Open VSX FIT routes, real local staging only.
 * No login, publishing, installation, trust bootstrap, or FIT execution.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const PACKAGE = 'org.maobits.my-first-training-app';
const VERSION = '1.0.0';
const SHA256 = '02dfe9df51ca1bed4288046fde6c067c7b1295c6f7dc6b909ba6b7b1aad1e04d';
const DETAIL = `/fit-package/${PACKAGE}/versions/${VERSION}`;
const CATALOG = '/search?category=FIT%20Packages';
const RELEASES = [
    'com.blackwhi.std.validation.core',
    'org.maobits.my-first-training-app',
    'org.blackwhi.examples.packaged.volume'
];
const SECTIONS = [
    'overview',
    'categories',
    'tags',
    'size',
    'documentation',
    'api',
    'examples',
    'dependencies',
    'compatibility',
    'security',
    'versions',
    'distribution',
    'media',
    'links',
    'community',
    'support',
    'business'
];

/** Refuse accidental execution against the upstream public Open VSX service. */
test.beforeEach(async ({ page }) => {
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin === 'http://127.0.0.1:43180') {
            await route.continue();
        } else {
            await route.abort('blockedbyclient');
        }
    });
});

async function approvedDetail(page: Page): Promise<void> {
    await page.goto(DETAIL);
    await expect(page.locator('#fit-overview')).toBeVisible();
    await expect(page.locator('#fit-business')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^my first training app$/i })).toBeVisible();
}

test('native catalog contains three real, unique FIT products', async ({ page }) => {
    const response = await page.goto(CATALOG);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'FIT Packages', exact: true })).toBeVisible();
    for (const id of RELEASES) {
        await expect(page.locator(`a[href="/fit-package/${id}"]`)).toHaveCount(1);
    }
    const productLinks = page.locator('a[href^="/fit-package/"]');
    expect(await productLinks.count()).toBeGreaterThanOrEqual(RELEASES.length);
    await expect(page.getByText(/FIT packages from loaded pages/)).toBeVisible();
    await test.info().attach('catalog', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });
});

test('a native package card opens its real approved detail', async ({ page }) => {
    await page.goto(CATALOG);
    const link = page.locator(`a[href="/fit-package/${PACKAGE}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/fit-package/${PACKAGE.replaceAll('.', '\\.')}$`));
    await expect(page.locator('#fit-overview')).toBeVisible();
    await expect(page.locator('#fit-business')).toContainText('SPDX/license expression');
});

test('approved FIT-02 profile displays all 17 panels and native identity', async ({ page }) => {
    await approvedDetail(page);
    const identity = page.getByRole('heading', { level: 1, name: /^my first training app$/i });
    await expect(identity).not.toBeEmpty();
    for (const id of SECTIONS) {
        await expect(page.locator(`section#fit-${id}`)).toHaveCount(1);
        await expect(page.locator(`nav[aria-label="Product sections"] a[href="#fit-${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('section[id^="fit-"]')).toHaveCount(SECTIONS.length);
    await page.locator('nav[aria-label="Product sections"] a[href="#fit-business"]').click();
    await expect(page).toHaveURL(/#fit-business$/);
    await test.info().attach('approved-product', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png'
    });
});

test('verified editorial documents switch between README and license', async ({ page }) => {
    await approvedDetail(page);
    const docs = page.locator('#fit-documentation');
    await expect(docs.getByRole('tab', { name: 'README', exact: true })).toBeVisible();
    await expect(docs.locator('article')).toBeVisible();
    const readme = await docs.locator('article').innerText();
    expect(readme.trim().length).toBeGreaterThan(10);
    await docs.getByRole('tab', { name: 'License', exact: true }).click();
    await expect(docs.getByRole('tab', { name: 'License', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(docs.locator('article')).toBeVisible();
    await expect.poll(() => docs.locator('article').innerText()).not.toBe(readme);
    const license = await docs.locator('article').innerText();
    expect(license.trim().length).toBeGreaterThan(10);
    await expect(docs.getByText('Document integrity could not be verified.')).toHaveCount(0);
});

test('declared product images load without broken media', async ({ page }) => {
    await approvedDetail(page);
    const images = page.locator('#fit-media img');
    for (let i = 0; i < (await images.count()); i += 1) {
        await images.nth(i).scrollIntoViewIfNeeded();
        await expect
            .poll(() => images.nth(i).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
            .toBe(true);
    }
});

test('native browser downloads immutable .fitpkg with correct SHA-256', async ({ page }) => {
    await approvedDetail(page);
    const button = page.getByRole('link', { name: `Download ${PACKAGE} version ${VERSION} FIT package` });
    await expect(button).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toBe(`${PACKAGE}-${VERSION}.fitpkg`);
    const bytes = await readFile(await download.path());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHA256);
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
});

test('unknown exact FIT version does not expose a download link', async ({ page }) => {
    await page.goto(`/fit-package/${PACKAGE}/versions/9.9.9`);
    await expect(page.getByText('The exact FIT release could not be verified.')).toBeVisible();
    await expect(page.locator('a[href$="/download"]')).toHaveCount(0);
});

test('native approved detail has no horizontal viewport overflow', async ({ page }) => {
    await approvedDetail(page);
    const sizes = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth
    }));
    expect(sizes.documentWidth).toBeLessThanOrEqual(sizes.viewport + 6);
});
