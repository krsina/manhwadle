import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MultiplayerContributionPanel } from './MultiplayerContributionPanel'

const contribution = {
  userId: 'other',
  username: 'Guest',
  listName: 'Guest picks',
  entryCount: 8,
  eligibleCounts: { summary: 6 },
  combinedEligibleCount: 6,
  contributedAt: null,
  sourceListId: null,
}

describe('MultiplayerContributionPanel', () => {
  it('renders sanitized contribution metadata without reusable list ids', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        contributions={[contribution]}
        summary={{
          contributorCount: 1,
          requiredContributorCount: 1,
          activeMemberCount: 3,
          uniqueTitleCount: 8,
          perModeEligibleCounts: { summary: 6 },
          combinedEligibleCount: 6,
        }}
        savedLists={[]}
        onContribute={() => {}}
        onManageLists={() => {}}
      />,
    )
    expect(html).toContain('Guest picks')
    expect(html).toContain('8 unique titles')
    expect(html).not.toContain('Summary 6')
    expect(html).not.toContain('sourceListId')
    expect(html).not.toContain('manhwa')
    expect(html).not.toContain('Summary ')
    expect(html).not.toContain('Cover ')
    expect(html).not.toMatch(/\d+\s+saved/)
  })

  it('frames a single shared list as enough for the whole room', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        contributions={[contribution]}
        summary={{
          contributorCount: 1,
          requiredContributorCount: 1,
          activeMemberCount: 4,
          uniqueTitleCount: 8,
          perModeEligibleCounts: { summary: 6 },
          combinedEligibleCount: 6,
        }}
        savedLists={[]}
        onContribute={() => {}}
        onManageLists={() => {}}
      />,
    )
    expect(html).toContain('1 of 4 players shared a list.')
    expect(html).toContain('Optional')
    expect(html).not.toContain('Everyone else can just play')
    expect(html).not.toContain('players contributed')
  })

  it('asks for the first list when nobody has shared one', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        contributions={[]}
        summary={{
          contributorCount: 0,
          requiredContributorCount: 1,
          activeMemberCount: 2,
          uniqueTitleCount: 0,
          perModeEligibleCounts: { summary: 0 },
          combinedEligibleCount: 0,
        }}
        savedLists={[]}
        onContribute={() => {}}
        onManageLists={() => {}}
      />,
    )
    expect(html).toContain('One list is enough to start the match.')
    expect(html).toContain('Create a list')
    expect(html).toContain('0 unique titles')
    expect(html).not.toContain('is-short')
  })

  it('lists saved lists by name only in the picker', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        contributions={[]}
        summary={{
          contributorCount: 0,
          requiredContributorCount: 1,
          activeMemberCount: 1,
          uniqueTitleCount: 0,
          perModeEligibleCounts: {},
          combinedEligibleCount: 0,
        }}
        savedLists={[
          {
            id: 'list-1',
            name: 'Top 10',
            entryCount: 10,
            createdAt: null,
            updatedAt: null,
          },
        ]}
        onContribute={() => {}}
        onManageLists={() => {}}
      />,
    )
    expect(html).toContain('>Top 10<')
    expect(html).not.toContain('Top 10 (10)')
  })
})
