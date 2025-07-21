import { getMessaging } from 'firebase/messaging';
import { app } from './firebase/config';

console.log('Initializing Firebase messaging...');

export const messaging = getMessaging(app);
