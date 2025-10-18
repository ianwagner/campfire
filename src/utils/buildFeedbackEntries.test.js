import { buildFeedbackEntriesForGroup } from './buildFeedbackEntries';

describe('buildFeedbackEntriesForGroup', () => {
  it('deduplicates identical recipe feedback that was duplicated for multiple aspect ratios', () => {
    const entries = buildFeedbackEntriesForGroup({
      groupId: 'g1',
      groupName: 'Launch Group',
      assets: [
        {
          id: 'asset-1',
          filename: 'BRAND_GROUP_101_916_V1.png',
          recipeCode: '101',
          comment: 'Increase the contrast on the CTA.',
          lastUpdatedAt: new Date('2024-04-01T12:00:00Z'),
        },
        {
          id: 'asset-2',
          filename: 'BRAND_GROUP_101_11_V1.png',
          recipeCode: '101',
          comment: 'Increase the contrast on the CTA.',
          lastUpdatedAt: new Date('2024-04-02T12:00:00Z'),
        },
      ],
    });

    const recipeEntry = entries.find((entry) => entry.type === 'recipe' && entry.recipeCode === '101');
    expect(recipeEntry).toBeDefined();
    expect(recipeEntry.commentList).toHaveLength(1);
    expect(recipeEntry.commentList[0].text).toBe('Increase the contrast on the CTA.');
    expect(recipeEntry.commentList[0].assetLabel).toContain('BRAND_GROUP_101_916_V1.png');
    expect(recipeEntry.commentList[0].assetLabel).toContain('BRAND_GROUP_101_11_V1.png');

    // Ensure the flattened comment view only includes the feedback once.
    const commentLines = recipeEntry.comment.split('\n');
    expect(commentLines).toHaveLength(1);
    expect(commentLines[0]).toMatch(/Increase the contrast on the CTA\./);
  });
});

