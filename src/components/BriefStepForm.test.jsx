import saveBrandProducts from '../utils/saveBrandProducts.js';
import { doc, setDoc } from 'firebase/firestore';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ id: 'ref' })),
  setDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('../firebase/config', () => ({ db: {} }));

describe('saveBrandProducts', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('persists products to brand document', async () => {
    const products = [
      {
        values: {
          name: 'Prod',
          url: 'https://example.com',
          description: ['desc'],
          benefits: ['ben'],
          featuredImage: 'img1',
          images: ['img1', 'img2'],
        },
      },
    ];
    await saveBrandProducts('brand1', products);
    expect(doc).toHaveBeenCalledWith({}, 'brands', 'brand1');
    expect(setDoc).toHaveBeenCalledWith(
      { id: 'ref' },
      {
        products: [
          {
            name: 'Prod',
            url: 'https://example.com',
            description: ['desc'],
            benefits: ['ben'],
            featuredImage: 'img1',
            images: ['img1', 'img2'],
          },
        ],
      },
      { merge: true }
    );
  });
});
