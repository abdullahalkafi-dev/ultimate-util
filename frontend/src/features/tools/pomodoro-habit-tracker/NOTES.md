# Pomodoro & Habit Tracker: gaps
- Session edit = create new + delete old (no update hook for focus sessions is exported; id changes).
- One active timer per device across tabs (localStorage + BroadcastChannel, owner heartbeat, stale after 6 s). No cross-device takeover/active-timer sync (no API for it).
- Not built: clock-jump detection, session splitting at midnight, tags, per-device overlap flags, heat-map calendar, habit target history (changes apply to all weeks), goal per day setting, 30-day check-in edit window beyond the last 7 days.
- Notifications use `new Notification`; Android Chrome needs a service worker (not implemented). Hidden-tab end alert uses a Worker timer + visibilitychange (best effort).
- Finished sessions that fail to sync are queued in localStorage (`uu-focus-pending`) and retried on load/online.
- Guests never reach the tool (guestAccess 'gate'); no local-only timer.
