import { parsePdp } from './parsePdp.js';

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: jest.fn().mockResolvedValue({ choices: [ { message: { content: '{}' } } ] }) } },
    })),
  };
});

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

test('collects images from various tags', async () => {
  const html = `
    <html>
      <head>
        <meta property='og:image' content='https://cdn.com/og.jpg'>
        <meta name='twitter:image' content='/twitter.jpg'>
        <link rel='image_src' href='https://cdn.com/link.jpg'>
        <script type='application/ld+json'>{"image":["ld1.jpg","https://cdn.com/ld2.jpg"]}</script>
      </head>
      <body>
        <img srcset='https://cdn.com/small.jpg 100w, https://cdn.com/big.jpg 1000w'>
        <img data-src='https://cdn.com/lazy.jpg' width='10'>
        <img src='https://cdn.com/img.jpg'>
      </body>
    </html>`;
  global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(html) });
  const res = await parsePdp.run({ data: { url: 'http://example.com/page' } });
  expect(res.imageUrls).toEqual([
    'https://cdn.com/og.jpg',
    'http://example.com/twitter.jpg',
    'https://cdn.com/link.jpg',
    'http://example.com/ld1.jpg',
    'https://cdn.com/ld2.jpg',
    'https://cdn.com/small.jpg',
    'https://cdn.com/big.jpg',
    'https://cdn.com/img.jpg',
  ]);
});

test('handles srcset only images', async () => {
  const html = `<img srcset='a.jpg 1x, a2.jpg 2x'>`;
  global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(html) });
  const res = await parsePdp.run({ data: { url: 'http://site.com' } });
  expect(res.imageUrls).toEqual(['http://site.com/a.jpg', 'http://site.com/a2.jpg']);
});

test('captures lazy loaded images', async () => {
  const html = `<img data-lazy='b.jpg' width='200'>`;
  global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(html) });
  const res = await parsePdp.run({ data: { url: 'http://site.com' } });
  expect(res.imageUrls).toEqual(['http://site.com/b.jpg']);
});
