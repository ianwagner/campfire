import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default async function saveBrandProducts(brandId, products) {
  if (!brandId) return;
  try {
    const productData = products.map((p) => ({
      name: p.values?.name || '',
      url: p.values?.url || '',
      description: Array.isArray(p.values?.description)
        ? p.values.description
        : [],
      benefits: Array.isArray(p.values?.benefits) ? p.values.benefits : [],
      featuredImage: p.values?.featuredImage || '',
      images: Array.isArray(p.values?.images) ? p.values.images : [],
    }));
    await setDoc(doc(db, 'brands', brandId), { products: productData }, { merge: true });
  } catch (err) {
    console.error('Failed to save products', err);
  }
}
