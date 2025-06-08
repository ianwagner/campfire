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

test('parseCsvFile handles quoted values with commas', async () => {
  const csv = 'name,imageUrl\n"Foo,Bar","http://ex.com/a,b.png"\nBaz,http://ex.com/b.png';
  const file = { text: () => Promise.resolve(csv) };
  const importType = {
    columns: [
      { index: 0, role: 'name' },
      { index: 1, role: 'imageUrl' },
    ],
  };

  const rows = await parseCsvFile(file, importType);

  expect(rows[0]).toEqual({
    name: 'Foo,Bar',
    imageUrls: ['http://ex.com/a,b.png'],
    imageUrl: 'http://ex.com/a,b.png',
  });
  expect(rows[1]).toEqual({
    name: 'Baz',
    imageUrls: ['http://ex.com/b.png'],
    imageUrl: 'http://ex.com/b.png',
  });
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

