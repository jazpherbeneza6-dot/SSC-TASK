import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  initializeAuth, 
  getReactNativePersistence, 
  browserLocalPersistence,
  getAuth
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: "AIzaSyBEiRq8ygwYM2uubCouNDN-R_oGVTMNfEs",
  authDomain: "ssc-tasks.firebaseapp.com",
  projectId: "ssc-tasks",
  storageBucket: "ssc-tasks.firebasestorage.app",
  messagingSenderId: "612327259711",
  appId: "1:612327259711:web:4f95b6cdd2f2c397f3c28a",
  measurementId: "G-WYH2J2D3KF"
};

// Singleton pattern for App initialization
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = (() => {
  if (getApps().length > 0) {
    try {
      return getAuth(app);
    } catch (e) {
      // Fallback to initialization if getAuth fails
    }
  }
  return Platform.OS === "web"
    ? initializeAuth(app, { persistence: browserLocalPersistence })
    : initializeAuth(app, { persistence: getReactNativePersistence(ReactNativeAsyncStorage) });
})();

export const db = getFirestore(app);
export const storage = getStorage(app);
