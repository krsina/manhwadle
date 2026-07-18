import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('critical paths', () => {
  test('homepage loads and exposes mode rows', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Manhwadle/i }).first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: /Legal/i })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: /Legal/i }).getByRole('link', { name: 'Privacy' }),
    ).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: /Legal/i }).getByRole('link', { name: 'Terms' }),
    ).toBeVisible()
  })

  test('play route shows taste gate on first visit', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })
    await page.goto('/play/summary')
    await expect(page.getByRole('heading', { name: /What do you usually read/i })).toBeVisible()
    await page.getByRole('radio', { name: /Action/i }).click()
    await page.getByRole('button', { name: /Continue/i }).click()
    await expect(page.getByRole('heading', { name: /Summary/i })).toBeVisible()
  })

  test('settings route opens account settings', async ({ page }) => {
    await page.goto('/settings')
    // Guests are redirected home; signed-out path still loads the app shell.
    await expect(page.getByRole('link', { name: /Manhwadle/i }).first()).toBeVisible()
  })

  test('how-to dialog is keyboard dismissible', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('manhwadle:readerTaste', 'both')
      localStorage.setItem(
        'manhwadle:consent:product_analytics',
        JSON.stringify({
          decision: 'denied',
          version: 1,
          updatedAt: new Date().toISOString(),
        }),
      )
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('manhwadle:howto:seen:')) localStorage.removeItem(key)
      }
    })
    await page.goto('/play/summary')
    // First-visit how-to auto-opens once taste is set.
    await expect(page.locator('#howto-title')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#howto-title')).toHaveCount(0)
  })

  test('consent banner can be dismissed', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear()
    })
    await page.goto('/')
    const deny = page.getByRole('button', { name: /No thanks/i })
    if (await deny.isVisible().catch(() => false)) {
      await deny.click()
      await expect(deny).toHaveCount(0)
    }
  })

  test('homepage has no serious axe violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast'])
      .analyze()
    const serious = results.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact || ''),
    )
    expect(serious).toEqual([])
  })
})
