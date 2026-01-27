import requests
import time

BASE = "http://localhost:8000"

def test_flow():
    import random
    suffix = random.randint(1000, 9999)
    username = f"User{suffix}"
    
    # 1. Register User A
    print(f">>> Registering {username}...")
    res = requests.post(f"{BASE}/register", json={"username": username, "password": "password123"})
    print(res.json())

    # 2. Login User A
    print(f"\n>>> Logging in {username}...")
    res = requests.post(f"{BASE}/login", json={"username": username, "password": "password123"})
    print(res.json())
    assert res.status_code == 200

    # 3. Check Users List (Should contain UserA)
    print(f"\n>>> Fetching Users (Expect {username})...")
    res = requests.get(f"{BASE}/users")
    print(res.json())
    users = [u['username'] for u in res.json()]
    assert username in users

    # 4. Set User A as BUSY
    print(f"\n>>> Setting {username} as Busy...")
    requests.post(f"{BASE}/status?username={username}&is_busy=true")
    
    # 5. Check Users List (Should be EMPTY because UserA is busy)
    print("\n>>> Fetching Users (Expect Empty)...")
    res = requests.get(f"{BASE}/users")
    print(res.json())
    assert len(res.json()) == 0

    # 6. Set User A as FREE
    print(f"\n>>> Setting {username} as Free...")
    requests.post(f"{BASE}/status?username={username}&is_busy=false")
    
    # 7. Check Users List (Should contain UserA again)
    print(f"\n>>> Fetching Users (Expect {username})...")
    res = requests.get(f"{BASE}/users")
    print(res.json())
    assert len(res.json()) == 1

    print("\n✅ Verification Passed!")

if __name__ == "__main__":
    try:
        test_flow()
    except Exception as e:
        print(f"\n❌ Test Failed: {e}")
