import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  ownedDevices: any[] | null;
  ownershipError: string | null;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkOwnership: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownedDevices, setOwnedDevices] = useState<any[] | null>(null);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);

  const checkOwnership = async (currentUser: User) => {
    setOwnershipError(null);
    try {
      const q = query(collection(db, 'devices'), where('ownerId', '==', currentUser.uid));
      const querySnapshot = await getDocs(q);
      const devices: any[] = [];
      querySnapshot.forEach((doc) => {
        devices.push({ id: doc.id, ...doc.data() });
      });
      setOwnedDevices(devices);
    } catch (error: any) {
      console.error("Error fetching owned devices:", error);
      // DO NOT mask this as an empty array (which would redirect to ClaimDeviceScreen).
      // Keep ownedDevices as null, but expose the error.
      setOwnershipError(error.message || 'Failed to check device ownership.');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await checkOwnership(currentUser);
      } else {
        setOwnedDevices(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signUp = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  const manualCheckOwnership = async () => {
    if (user) {
      await checkOwnership(user);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      ownedDevices,
      ownershipError,
      signIn,
      signUp,
      signOut: signOutUser,
      checkOwnership: manualCheckOwnership
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
