import summarizeAdUnits from './summarizeAdUnits';

const make = (status, extra = {}) => ({ status, firebaseUrl: `${status}.png`, ...extra });

test('summarizes ad unit statuses', () => {
  const list = [make('approved'), make('rejected'), make('edit_requested')];
  const summary = summarizeAdUnits(list);
  expect(summary.reviewed).toBe(3);
  expect(summary.approved).toBe(1);
  expect(summary.rejected).toBe(1);
  expect(summary.edit).toBe(1);
});

test('counts archived and ignores ready', () => {
  const list = [make('archived'), make('ready')];
  const summary = summarizeAdUnits(list);
  expect(summary.archived).toBe(1);
  expect(summary.reviewed).toBe(0);
});
