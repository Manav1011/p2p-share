# Revert to Guest-Only Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove login, registration, and user discovery features. Revert the app to a pure guest-based P2P experience where the QR code modal is shown automatically on launch.

**Architecture:** 
- Eliminate all auth-related state (`username`, `showLogin`, etc.) from `App.tsx`.
- Modify `useWebRTC` hook to always use random guest IDs and stop sending status updates to the backend.
- Remove UI components for Login and User Discovery.
- Set the QR Modal to be visible by default on startup.

**Tech Stack:** React, PeerJS, Lucide React

---

### Task 1: Revert `useWebRTC` Hook

**Files:**
- Modify: `hooks/useWebRTC.ts`

**Step 1: Remove `currentUsername` and `updateStatus`**

Remove the `currentUsername` parameter from the hook and the `updateStatus` helper function.

**Step 2: Simplify Peer ID generation**

Change the `initPeer` logic to always generate a random 4-character ID.

```typescript
// Before:
const peerId = currentUsername || Math.random().toString(36).substring(2, 6);

// After:
const peerId = Math.random().toString(36).substring(2, 6);
```

**Step 3: Remove calls to `updateStatus`**

Remove all instances where `updateStatus` is called (e.g., in `peer.on('connection')`, `disconnectPeer`, and `setupConnection`).

---

### Task 2: Simplify `App.tsx`

**Files:**
- Modify: `App.tsx`

**Step 1: Remove auth states and effects**

Remove `username`, `showLogin`, and `showUserList` states.
Remove the `localStorage` logic for `p2p_username`.
Remove the `ping` heartbeat `useEffect`.

**Step 2: Update `showQR` default state**

Change `const [showQR, setShowQR] = useState(false);` to `const [showQR, setShowQR] = useState(true);`.

**Step 3: Clean up JSX**

Remove `<LoginOverlay />` and `<UserList />` components from the return statement.
Update the header to remove the Login/Logout buttons and the "Users" (scan) button.

---

### Task 3: Delete Unused Components and Files

**Files:**
- Delete: `components/LoginOverlay.tsx`
- Delete: `components/UserList.tsx`

**Step 1: Remove files from the project**

Delete the physical files as they are no longer used.

---

### Task 4: Remove Backend (Optional but recommended)

**Files:**
- Delete: `server/` directory
- Delete: `p2p_share.db` (if exists)

**Step 1: Delete the server folder**

Since the backend was exclusively for user management, it is no longer needed.
