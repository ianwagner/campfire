import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase/config';

export const createStripeCustomer = httpsCallable(functions, 'createStripeCustomer');
