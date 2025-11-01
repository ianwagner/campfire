import { shouldSkipAutoDispatch } from './integrationStatus';

describe('shouldSkipAutoDispatch', () => {
  it('skips when the state is manual', () => {
    expect(shouldSkipAutoDispatch('manual')).toBe(true);
    expect(shouldSkipAutoDispatch('MANUAL')).toBe(true);
  });

  it('skips when the state is manual_input', () => {
    expect(shouldSkipAutoDispatch('manual_input')).toBe(true);
    expect(shouldSkipAutoDispatch('Manual_Input')).toBe(true);
  });

  it('does not skip when the state is not in the skip list', () => {
    expect(shouldSkipAutoDispatch('approved')).toBe(false);
    expect(shouldSkipAutoDispatch(null)).toBe(false);
  });
});
