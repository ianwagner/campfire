import { parseCsvFile } from './AdminRecipeSetup.jsx';

test('parseCsvFile parses basic CSV rows', async () => {
  const csv = 'name,angle\nFoo,Bar\nBaz,Qux';
  const file = { text: () => Promise.resolve(csv) };
  const importType = {
    columns: [
      { index: 0, role: 'name' },
      { index: 1, role: 'angle' },
    ],
  };

  const rows = await parseCsvFile(file, importType);

  expect(rows).toEqual([
    { name: 'Foo', angle: 'Bar' },
    { name: 'Baz', angle: 'Qux' },
  ]);
});

test('parseCsvFile handles offer role', async () => {
  const csv = 'offer\nDeal1\nDeal2';
  const file = { text: () => Promise.resolve(csv) };
  const importType = {
    columns: [
      { index: 0, role: 'offer' },
    ],
  };

  const rows = await parseCsvFile(file, importType);

  expect(rows).toEqual([
    { offer: 'Deal1' },
    { offer: 'Deal2' },
  ]);
});

