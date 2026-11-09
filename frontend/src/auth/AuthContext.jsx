import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { clearAuthToken, exchangeGoogleCode, getCurrentUser, hasAuthToken, login as loginRequest, logout as logoutRequest, setAuthToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        if (!hasAuthToken()) {
            setUser(null);
            setLoading(false);
            return null;
        }
        try {
            const result = await getCurrentUser();
            setUser(result.user);
            return result.user;
        } catch (error) {
            if (error.status === 401) clearAuthToken();
            setUser(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshUser();
        const onExpired = () => setUser(null);
        window.addEventListener('coursehubs:auth-expired', onExpired);
        return () => window.removeEventListener('coursehubs:auth-expired', onExpired);
    }, [refreshUser]);

    const signIn = useCallback(async (credentials) => {
        const result = await loginRequest(credentials);
        setAuthToken(result.token);
        setUser(result.user);
        return result;
    }, []);

    const signInWithGoogleCode = useCallback(async (code) => {
        const result = await exchangeGoogleCode(code);
        setAuthToken(result.token);
        setUser(result.user);
        return result;
    }, []);

    const updateUser = useCallback((nextUser) => {
        setUser((current) => ({ ...(current || {}), ...(nextUser || {}) }));
    }, []);

    const replaceSession = useCallback((token, nextUser) => {
        setAuthToken(token);
        setUser(nextUser);
    }, []);

    const signOut = useCallback(async () => {
        try {
            if (hasAuthToken()) await logoutRequest();
        } finally {
            clearAuthToken();
            setUser(null);
        }
    }, []);

    const value = useMemo(() => ({ user, loading, signIn, signInWithGoogleCode, signOut, refreshUser, updateUser, replaceSession }), [user, loading, signIn, signInWithGoogleCode, signOut, refreshUser, updateUser, replaceSession]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used inside AuthProvider.');
    return context;
}
