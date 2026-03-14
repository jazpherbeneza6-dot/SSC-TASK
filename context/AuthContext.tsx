import { createContext, useState, ReactNode } from "react";

export type AuthUser = {
  uid: string;
  email: string;
  firstname: string;
  lastname: string;
  photo_url: string;
  position?: string;
  signup_method?: string;
  role: "admin" | "member";
} | null;

type AuthContextType = {
  user: AuthUser;
  setUser: (u: AuthUser) => void;
  isAuthReady: boolean;
  setIsAuthReady: (v: boolean) => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser>(null);
  const [isAuthReady, setIsAuthReady] = useState(false); 

  return (
    <AuthContext.Provider value={{ user, setUser, isAuthReady, setIsAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};