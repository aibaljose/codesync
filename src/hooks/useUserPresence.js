import { useEffect } from 'react';
import { ref, onValue, onDisconnect, update, serverTimestamp } from 'firebase/database';
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

        // Update user status
        update(userStatusRef, {
          uid: user.uid,
          displayName: user.displayName || 'Anonymous User',
          email: user.email || '',
          photoURL: user.photoURL || '',
          role: user.email === 'aibaljosej@gmail.com' ? 'admin' : (user.role || 'dev'),
          isOnline: true,
          isLoggedIn: true,
          lastActive: serverTimestamp()
        }).catch((err) => {
          console.error('Error updating user presence:', err);
        });
      }
    });

    return () => {
      unsubscribe();
      // When unmounting/logging out locally, mark offline safely
      update(isOnlineRef, false).catch(() => {});
    };
  }, [user?.uid, user?.displayName, user?.email, user?.photoURL, user?.role]);
}
