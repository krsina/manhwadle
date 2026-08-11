import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MultiplayerContributionPanel } from './MultiplayerContributionPanel'

describe('MultiplayerContributionPanel', () => {
  it('renders sanitized contribution metadata without reusable list ids', () => {
    const html = renderToStaticMarkup(
      <MultiplayerContributionPanel
        viewerUserId="viewer"
        selectedModes={['summary']}
        contributions={[
          {
            userId: 'other',
            username: 'Guest',
            listName: 'Guest picks',
            entryCount: 8,
            eligibleCounts: { summary: 6 },
            combinedEligibleCount: 6,
            contributedAt: null,
            sourceListId: null,
          },
        ]}
        summary={{
          contributorCount: 1,
          requiredContributorCount: 2,
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
})
