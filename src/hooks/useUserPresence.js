import { useEffect } from 'react';
import { ref, onValue, onDisconnect, update, push, set, serverTimestamp } from 'firebase/database';
import { rtdb } from '../config/firebase';

export function useUserPresence(user) {
  useEffect(() => {
    if (!user?.uid) return;

    const connectedRef = ref(rtdb, '.info/connected');
    const userStatusRef = ref(rtdb, `status/users/${user.uid}`);
    const isOnlineRef = ref(rtdb, `status/users/${user.uid}/isOnline`);
    const lastActiveRef = ref(rtdb, `status/users/${user.uid}/lastActive`);

    const unsubscribe = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        // Set onDisconnect hooks first
        onDisconnect(isOnlineRef).set(false);
        onDisconnect(lastActiveRef).set(serverTimestamp());

        const now = new Date();
        const loginISO = now.toISOString();
        const loginTimeString = now.toLocaleTimeString();
        const loginDateTimeString = now.toLocaleString();

        // Update user status in RTDB
        update(userStatusRef, {
          uid: user.uid,
          displayName: user.displayName || 'Anonymous User',
          email: user.email || '',
          photoURL: user.photoURL || '',
          role: user.email === 'aibaljosej@gmail.com' ? 'admin' : (user.role || 'dev'),
          isOnline: true,
          isLoggedIn: true,
          loginTime: loginDateTimeString,
          time: loginTimeString,
          lastLoginAt: serverTimestamp(),
          lastLoginAtISO: loginISO,
          lastActive: serverTimestamp(),
          lastActiveISO: loginISO
        }).catch((err) => {
          console.error('Error updating user presence:', err);
        });

        // Log each login event to RTDB user & global logs
        try {
          const userLoginRef = push(ref(rtdb, `logs/users/${user.uid}/logins`));
          const loginRecord = {
            id: userLoginRef.key,
            uid: user.uid,
            displayName: user.displayName || 'Anonymous User',
            email: user.email || '',
            role: user.email === 'aibaljosej@gmail.com' ? 'admin' : (user.role || 'dev'),
            loginTime: loginDateTimeString,
            time: loginTimeString,
            loginAt: serverTimestamp(),
            loginAtISO: loginISO,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
          };
          set(userLoginRef, loginRecord).catch(() => {});
          set(ref(rtdb, `logs/all_logins/${userLoginRef.key}`), loginRecord).catch(() => {});
        } catch (logErr) {
          console.warn('Could not record login log:', logErr);
        }
      }
    });

    return () => {
      unsubscribe();
      // When unmounting/logging out locally, mark offline safely
      update(isOnlineRef, false).catch(() => {});
    };
  }, [user?.uid, user?.displayName, user?.email, user?.photoURL, user?.role]);
}
