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
        selectedModes={['summary']}
        contributions={[contribution]}
        summary={{
          contributorCount: 1,
          requiredContributorCount: 1,
          activeMemberCount: 3,
          perModeEligibleCounts: { summary: 6 },
          combinedEligibleCount: 6,
        }}
        savedLists={[]}
        onContribute={() => {}}
        onManageLists={() => {}}
      />,
    )
    expect(html).toContain('Guest picks')
    expect(html).toContain('Summary 6')
    expect(html).not.toContain('sourceListId')
    expect(html).not.toContain('manhwa')
  })

  it('frames a single shared list as enough for the whole room', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        selectedModes={['summary']}
        contributions={[contribution]}
        summary={{
          contributorCount: 1,
          requiredContributorCount: 1,
          activeMemberCount: 4,
          perModeEligibleCounts: { summary: 6 },
          combinedEligibleCount: 6,
        }}
        savedLists={[]}
        onContribute={() => {}}
        onManageLists={() => {}}
      />,
    )
    expect(html).toContain('1 of 4 players shared a list')
    expect(html).toContain('Optional')
    expect(html).not.toContain('players contributed')
  })

  it('asks for the first list when nobody has shared one', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        selectedModes={['summary']}
        contributions={[]}
        summary={{
          contributorCount: 0,
          requiredContributorCount: 1,
          activeMemberCount: 2,
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
    expect(html).toContain('is-short')
  })
})
