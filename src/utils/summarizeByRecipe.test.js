import summarizeByRecipe from './summarizeByRecipe';

const make = (status, recipe = '001', extra = {}) => ({
  status,
  recipeCode: recipe,
  filename: `BRND_GRP_${recipe}_9x16_V1.png`,
  firebaseUrl: `${status}.png`,
  ...extra,
});

test('deduplicates versions and sizes by recipe', () => {
  const list = [
    make('approved', '001'),
    make('approved', '001', { aspectRatio: '3x5', filename: 'BRND_GRP_001_3x5_V2.png' }),
    make('rejected', '002'),
  ];
  const summary = summarizeByRecipe(list);
  expect(summary.approved).toBe(1);
  expect(summary.rejected).toBe(1);
  expect(summary.reviewed).toBe(2);
});

test('uses highest priority status per recipe', () => {
  const list = [
    make('rejected', '001'),
    make('approved', '001', { filename: 'BRND_GRP_001_9x16_V2.png' }),
    make('edit_requested', '001', { filename: 'BRND_GRP_001_3x5_V3.png' }),
  ];
  const summary = summarizeByRecipe(list);
  expect(summary.approved).toBe(1);
  expect(summary.rejected).toBe(0);
  expect(summary.edit).toBe(0);
  expect(summary.reviewed).toBe(1);
});

test('counts archived ads', () => {
  const list = [make('archived', '001'), make('approved', '002')];
  const summary = summarizeByRecipe(list);
  expect(summary.archived).toBe(1);
  expect(summary.approved).toBe(1);
});
