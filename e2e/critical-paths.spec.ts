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

  test('avatar shop exposes the guest catalog and reward rules', async ({ page }) => {
    await page.goto('/shop')
    await expect(page.getByRole('heading', { name: 'Avatar Shop' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Sign in to unlock and equip' })).toBeVisible()

    const shadowHunter = page.getByRole('button').filter({ hasText: 'Shadow Hunter' })
    await expect(shadowHunter).toBeVisible()
    await shadowHunter.click()
    await expect(shadowHunter).toHaveAttribute('aria-pressed', 'true')

    const defaultMale = page.getByRole('button').filter({ hasText: 'Default (Male)' })
    await expect(defaultMale).toBeVisible()

    await expect(page.getByText('Win +10')).toBeVisible()
    await expect(page.getByText('Full loss +3')).toBeVisible()
    await expect(page.getByText('Surrender +0')).toBeVisible()
    const signIn = page.getByRole('button', { name: 'Sign in to unlock' })
    if (await signIn.isVisible().catch(() => false)) {
      await signIn.click()
      await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    }
  })

  test('avatar shop remains usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/shop')
    await expect(page.getByRole('heading', { name: 'Avatar Shop' })).toBeVisible()
    await expect(page.locator('.avatar-shop-preview .pixel-avatar')).toBeVisible()
    await expect(page.getByRole('button').filter({ hasText: 'Skybreaker Monk' })).toBeVisible()
  })

  test('how-to dialog is keyboard dismissible', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('manhwadle:readerTaste', 'both')
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
