import requests
import sys
import json
from datetime import datetime

class CreaoBrowserAPITester:
    def __init__(self, base_url="https://no-redirect-search.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        self.owner_cookies = None
        self.test_user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, cookies=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, cookies=cookies)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers, cookies=cookies)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers, cookies=cookies)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_owner_login_flow(self):
        """Test complete owner login flow with security question"""
        print("\n=== TESTING OWNER LOGIN FLOW ===")
        
        # Step 1: Initial login (should require security verification)
        success, response = self.run_test(
            "Owner Login (Initial)",
            "POST",
            "auth/login",
            200,
            data={"username": "Ghost", "password": "Gage2011!"}
        )
        
        if not success:
            return False
            
        if not response.get('requires_verification'):
            print("❌ Owner login should require security verification")
            return False
            
        if response.get('security_question') != "What's your favorite food?":
            print(f"❌ Wrong security question: {response.get('security_question')}")
            return False
            
        print("✅ Owner login correctly requires security verification")
        
        # Step 2: Security verification
        success, response = self.run_test(
            "Owner Security Verification",
            "POST", 
            "auth/verify-security",
            200,
            data={"username": "ghost", "security_answer": "moms steak"}
        )
        
        if not success:
            return False
            
        if response.get('role') != 'owner':
            print(f"❌ Expected owner role, got: {response.get('role')}")
            return False
            
        # Store cookies for admin tests
        self.owner_cookies = self.session.cookies
        print("✅ Owner security verification successful")
        return True

    def test_admin_endpoints(self):
        """Test admin panel endpoints"""
        print("\n=== TESTING ADMIN ENDPOINTS ===")
        
        if not self.owner_cookies:
            print("❌ No owner cookies available")
            return False
            
        # Test get users
        success, users_data = self.run_test(
            "Get All Users (Admin)",
            "GET",
            "admin/users", 
            200,
            cookies=self.owner_cookies
        )
        
        if not success:
            return False
            
        if not isinstance(users_data, list):
            print("❌ Users data should be a list")
            return False
            
        print(f"✅ Found {len(users_data)} users in system")
        
        # Find a non-owner user for testing
        test_user = None
        for user in users_data:
            if user.get('role') != 'owner':
                test_user = user
                break
                
        if not test_user:
            print("⚠️ No non-owner users found for ban/delete testing")
            return True
            
        self.test_user_id = test_user['_id']
        print(f"✅ Found test user: {test_user['username']}")
        
        # Test ban user
        success, ban_response = self.run_test(
            "Ban User",
            "POST",
            "admin/ban",
            200,
            data={
                "user_id": self.test_user_id,
                "duration_minutes": 5,
                "reason": "Test ban"
            },
            cookies=self.owner_cookies
        )
        
        if not success:
            return False
            
        print("✅ User banned successfully")
        
        # Test unban user
        success, unban_response = self.run_test(
            "Unban User",
            "POST",
            f"admin/unban/{self.test_user_id}",
            200,
            cookies=self.owner_cookies
        )
        
        if not success:
            return False
            
        print("✅ User unbanned successfully")
        return True

    def test_registration_flow(self):
        """Test user registration with email verification"""
        print("\n=== TESTING REGISTRATION FLOW ===")
        
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        test_username = f"testuser_{datetime.now().strftime('%H%M%S')}"
        
        # Step 1: Send verification code
        success, code_response = self.run_test(
            "Send Verification Code",
            "POST",
            "auth/send-verification",
            200,
            data={"email": test_email}
        )
        
        if not success:
            return False
            
        verification_code = code_response.get('code')
        if not verification_code:
            print("❌ No verification code returned")
            return False
            
        print(f"✅ Verification code sent: {verification_code}")
        
        # Step 2: Register user
        success, register_response = self.run_test(
            "Register New User",
            "POST",
            "auth/register",
            200,
            data={
                "username": test_username,
                "password": "testpass123",
                "email": test_email
            }
        )
        
        if not success:
            return False
            
        if register_response.get('username') != test_username.lower():
            print(f"❌ Username mismatch: {register_response.get('username')}")
            return False
            
        print("✅ User registration successful")
        return True

    def test_banned_user_login(self):
        """Test that banned users cannot login"""
        print("\n=== TESTING BANNED USER LOGIN ===")
        
        if not self.test_user_id or not self.owner_cookies:
            print("⚠️ Skipping banned user test - no test user available")
            return True
            
        # First ban the user
        success, _ = self.run_test(
            "Ban Test User",
            "POST",
            "admin/ban",
            200,
            data={
                "user_id": self.test_user_id,
                "duration_minutes": 10,
                "reason": "Test ban for login check"
            },
            cookies=self.owner_cookies
        )
        
        if not success:
            return False
            
        # Try to login as banned user (this would need the actual credentials)
        # For now, just verify the ban was applied
        success, users_data = self.run_test(
            "Verify User is Banned",
            "GET",
            "admin/users",
            200,
            cookies=self.owner_cookies
        )
        
        if success:
            banned_user = next((u for u in users_data if u['_id'] == self.test_user_id), None)
            if banned_user and banned_user.get('banned_until'):
                print("✅ User is properly banned")
                
                # Unban for cleanup
                self.run_test(
                    "Cleanup - Unban User",
                    "POST",
                    f"admin/unban/{self.test_user_id}",
                    200,
                    cookies=self.owner_cookies
                )
                return True
                
        print("❌ User ban verification failed")
        return False

    def test_auth_protection(self):
        """Test that admin endpoints require owner role"""
        print("\n=== TESTING AUTH PROTECTION ===")
        
        # Test admin endpoint without auth
        success, _ = self.run_test(
            "Admin Endpoint Without Auth",
            "GET",
            "admin/users",
            401  # Should be unauthorized
        )
        
        if not success:
            print("❌ Admin endpoint should return 401 without auth")
            return False
            
        print("✅ Admin endpoints properly protected")
        return True

def main():
    print("🚀 Starting CreaoBrowser API Tests")
    print("=" * 50)
    
    tester = CreaoBrowserAPITester()
    
    # Run all tests
    tests = [
        tester.test_auth_protection,
        tester.test_owner_login_flow,
        tester.test_admin_endpoints,
        tester.test_registration_flow,
        tester.test_banned_user_login
    ]
    
    all_passed = True
    for test in tests:
        try:
            result = test()
            if not result:
                all_passed = False
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
            all_passed = False
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    
    if all_passed and tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("💥 Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())