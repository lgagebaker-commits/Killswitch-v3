from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# Password hashing
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# JWT Token creation
def create_access_token(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# Create the main app
app = FastAPI()

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/api/auth")
admin_router = APIRouter(prefix="/api/admin")

# Pydantic Models
class UserRegister(BaseModel):
    username: str
    password: str
    email: str
    security_question: Optional[str] = None
    security_answer: Optional[str] = None

class VerifyEmail(BaseModel):
    email: str
    code: str

class UserLogin(BaseModel):
    username: str
    password: str

class SecurityVerify(BaseModel):
    username: str
    security_answer: str

class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    created_at: str

class BookmarkCreate(BaseModel):
    title: str
    url: str
    icon: Optional[str] = "🔗"

class BookmarkResponse(BaseModel):
    id: str
    title: str
    url: str
    icon: str
    created_at: str

class HistoryEntry(BaseModel):
    url: str
    title: str
    visited_at: Optional[str] = None

class SettingsUpdate(BaseModel):
    homepage: Optional[str] = None
    theme: Optional[str] = None
    show_bookmarks_bar: Optional[bool] = None

class SavedPassword(BaseModel):
    site: str
    username: str
    password: str

class BanUser(BaseModel):
    user_id: str
    duration_minutes: int
    reason: Optional[str] = "Banned by owner"

# Auth helper - get current user
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        # Check if user is banned
        if user.get("banned_until"):
            ban_time = datetime.fromisoformat(user["banned_until"])
            if ban_time > datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail=f"You are banned until {ban_time.strftime('%Y-%m-%d %H:%M UTC')}. Reason: {user.get('ban_reason', 'No reason provided')}")
            else:
                # Ban expired, remove it
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$unset": {"banned_until": "", "ban_reason": ""}}
                )
        
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        user.pop("security_answer", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Owner check
async def get_owner_user(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user

# Auth endpoints
@auth_router.post("/send-verification")
async def send_verification_code(data: dict):
    email = data.get("email", "").lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    
    # Generate 6-digit code
    import random
    code = str(random.randint(100000, 999999))
    
    # Store code with 10 minute expiry
    await db.verification_codes.delete_many({"email": email})
    await db.verification_codes.insert_one({
        "email": email,
        "code": code,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    })
    
    logger.info(f"Verification code for {email}: {code}")
    
    # Return the code directly (in production, send via email service)
    return {"message": "Verification code sent", "code": code}

@auth_router.post("/register")
async def register(user_data: UserRegister, response: Response):
    username = user_data.username.lower().strip()
    email = user_data.email.lower().strip()
    
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(user_data.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    
    existing = await db.users.find_one({"username": username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    existing_email = await db.users.find_one({"email": email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already in use")
    
    hashed = hash_password(user_data.password)
    user_doc = {
        "username": username,
        "email": email,
        "password_hash": hashed,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "security_question": user_data.security_question or "What's your favorite food?",
        "security_answer": (user_data.security_answer or "").lower().strip(),
        "is_online": True,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "settings": {
            "homepage": "https://www.google.com",
            "theme": "dark",
            "show_bookmarks_bar": True
        },
        "bookmarks": [],
        "history": [],
        "saved_passwords": []
    }
    
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    access_token = create_access_token(user_id, username)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "username": username,
        "role": "user",
        "created_at": user_doc["created_at"],
        "requires_verification": False,
        "access_token": access_token
    }

@auth_router.post("/login")
async def login(user_data: UserLogin, response: Response, request: Request):
    username = user_data.username.lower().strip()
    
    # Brute force protection
    client_ip = request.client.host if request.client else "unknown"
    identifier = f"{client_ip}:{username}"
    
    attempt = await db.login_attempts.find_one({"identifier": identifier})
    if attempt and attempt.get("count", 0) >= 5:
        lockout_time = attempt.get("locked_until")
        if lockout_time and datetime.fromisoformat(lockout_time) > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})
    
    user = await db.users.find_one({"username": username})
    if not user:
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not verify_password(user_data.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check if user is banned
    if user.get("banned_until"):
        ban_time = datetime.fromisoformat(user["banned_until"])
        if ban_time > datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail=f"You are banned until {ban_time.strftime('%Y-%m-%d %H:%M UTC')}. Reason: {user.get('ban_reason', 'No reason provided')}")
    
    # Clear failed attempts on success
    await db.login_attempts.delete_one({"identifier": identifier})
    
    # Check if owner needs security verification
    if user.get("role") == "owner" and user.get("security_answer"):
        return {
            "requires_verification": True,
            "username": username,
            "security_question": user.get("security_question", "What's your favorite food?")
        }
    
    # Update online status
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, username)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "username": user["username"],
        "role": user.get("role", "user"),
        "created_at": user.get("created_at", ""),
        "requires_verification": False,
        "access_token": access_token
    }

@auth_router.post("/verify-security")
async def verify_security(data: SecurityVerify, response: Response):
    username = data.username.lower().strip()
    user = await db.users.find_one({"username": username})
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    stored_answer = user.get("security_answer", "").lower().strip()
    provided_answer = data.security_answer.lower().strip()
    
    if stored_answer != provided_answer:
        raise HTTPException(status_code=401, detail="Incorrect security answer")
    
    # Update online status
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, username)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "username": user["username"],
        "role": user.get("role", "user"),
        "created_at": user.get("created_at", ""),
        "access_token": access_token
    }

@auth_router.post("/logout")
async def logout(response: Response, request: Request):
    # Try to update online status
    try:
        user = await get_current_user(request)
        await db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$set": {"is_online": False, "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
    except:
        pass
    
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}

@auth_router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    # Update last seen
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "id": user["_id"],
        "username": user["username"],
        "role": user.get("role", "user"),
        "created_at": user.get("created_at", ""),
        "settings": user.get("settings", {})
    }

@auth_router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["username"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# Admin endpoints (Owner only)
@admin_router.get("/users")
async def get_all_users(owner: dict = Depends(get_owner_user)):
    users = await db.users.find({}, {
        "password_hash": 0, 
        "security_answer": 0,
        "saved_passwords": 0
    }).to_list(1000)
    
    result = []
    for user in users:
        user["_id"] = str(user["_id"])
        # Check if online (last seen within 5 minutes)
        last_seen = user.get("last_seen")
        if last_seen:
            try:
                last_seen_dt = datetime.fromisoformat(last_seen)
                is_online = (datetime.now(timezone.utc) - last_seen_dt).total_seconds() < 300
                user["is_online"] = is_online
            except:
                user["is_online"] = False
        else:
            user["is_online"] = False
        result.append(user)
    
    return result

@admin_router.post("/ban")
async def ban_user(ban_data: BanUser, owner: dict = Depends(get_owner_user)):
    user = await db.users.find_one({"_id": ObjectId(ban_data.user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot ban the owner")
    
    ban_until = datetime.now(timezone.utc) + timedelta(minutes=ban_data.duration_minutes)
    
    # Ban the user and force logout by setting a ban token version
    await db.users.update_one(
        {"_id": ObjectId(ban_data.user_id)},
        {"$set": {
            "banned_until": ban_until.isoformat(),
            "ban_reason": ban_data.reason,
            "is_online": False,
            "force_logout": True
        }}
    )
    
    return {
        "message": f"User banned until {ban_until.strftime('%Y-%m-%d %H:%M UTC')}",
        "banned_until": ban_until.isoformat()
    }

@admin_router.post("/unban/{user_id}")
async def unban_user(user_id: str, owner: dict = Depends(get_owner_user)):
    result = await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$unset": {"banned_until": "", "ban_reason": "", "force_logout": ""}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found or not banned")
    
    return {"message": "User unbanned successfully"}

@admin_router.delete("/users/{user_id}")
async def delete_user_account(user_id: str, owner: dict = Depends(get_owner_user)):
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot delete the owner account")
    
    await db.users.delete_one({"_id": ObjectId(user_id)})
    
    return {"message": f"User '{user['username']}' deleted successfully"}

# User data endpoints
@api_router.get("/bookmarks")
async def get_bookmarks(user: dict = Depends(get_current_user)):
    return user.get("bookmarks", [])

@api_router.post("/bookmarks")
async def add_bookmark(bookmark: BookmarkCreate, user: dict = Depends(get_current_user)):
    bookmark_doc = {
        "id": str(ObjectId()),
        "title": bookmark.title,
        "url": bookmark.url,
        "icon": bookmark.icon,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$push": {"bookmarks": bookmark_doc}}
    )
    return bookmark_doc

@api_router.delete("/bookmarks/{bookmark_id}")
async def delete_bookmark(bookmark_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$pull": {"bookmarks": {"id": bookmark_id}}}
    )
    return {"message": "Bookmark deleted"}

@api_router.get("/history")
async def get_history(user: dict = Depends(get_current_user)):
    return user.get("history", [])[-100:]

@api_router.post("/history")
async def add_history(entry: HistoryEntry, user: dict = Depends(get_current_user)):
    history_doc = {
        "url": entry.url,
        "title": entry.title,
        "visited_at": entry.visited_at or datetime.now(timezone.utc).isoformat()
    }
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$push": {"history": history_doc}}
    )
    return history_doc

@api_router.delete("/history")
async def clear_history(user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"history": []}}
    )
    return {"message": "History cleared"}

@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return user.get("settings", {})

@api_router.put("/settings")
async def update_settings(settings: SettingsUpdate, user: dict = Depends(get_current_user)):
    update_doc = {}
    if settings.homepage is not None:
        update_doc["settings.homepage"] = settings.homepage
    if settings.theme is not None:
        update_doc["settings.theme"] = settings.theme
    if settings.show_bookmarks_bar is not None:
        update_doc["settings.show_bookmarks_bar"] = settings.show_bookmarks_bar
    
    if update_doc:
        await db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$set": update_doc}
        )
    
    updated_user = await db.users.find_one({"_id": ObjectId(user["_id"])})
    return updated_user.get("settings", {})

@api_router.get("/saved-passwords")
async def get_saved_passwords(user: dict = Depends(get_current_user)):
    return user.get("saved_passwords", [])

@api_router.post("/saved-passwords")
async def save_password(password_data: SavedPassword, user: dict = Depends(get_current_user)):
    password_doc = {
        "id": str(ObjectId()),
        "site": password_data.site,
        "username": password_data.username,
        "password": password_data.password,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$push": {"saved_passwords": password_doc}}
    )
    return {"id": password_doc["id"], "site": password_doc["site"], "username": password_doc["username"]}

@api_router.delete("/saved-passwords/{password_id}")
async def delete_saved_password(password_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$pull": {"saved_passwords": {"id": password_id}}}
    )
    return {"message": "Password deleted"}

# Heartbeat to keep online status
@api_router.post("/heartbeat")
async def heartbeat(user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(user["_id"])},
        {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "ok"}

# Basic routes
@api_router.get("/")
async def root():
    return {"message": "CreaoBrowser API"}

# Include routers
app.include_router(auth_router)
app.include_router(api_router)
app.include_router(admin_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Startup event - seed owner and create indexes
@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", sparse=True)
    await db.login_attempts.create_index("identifier")
    await db.verification_codes.create_index("email")
    await db.verification_codes.create_index("expires_at", expireAfterSeconds=0)
    
    # Seed OWNER account - Ghost
    owner_username = "ghost"
    owner_password = "Gage2011!"
    owner_security_question = "What's your favorite food?"
    owner_security_answer = "moms steak"
    
    existing_owner = await db.users.find_one({"username": owner_username})
    if existing_owner is None:
        hashed = hash_password(owner_password)
        await db.users.insert_one({
            "username": owner_username,
            "password_hash": hashed,
            "role": "owner",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "security_question": owner_security_question,
            "security_answer": owner_security_answer.lower().strip(),
            "is_online": False,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "settings": {
                "homepage": "https://www.google.com",
                "theme": "dark",
                "show_bookmarks_bar": True
            },
            "bookmarks": [],
            "history": [],
            "saved_passwords": []
        })
        logger.info(f"Owner account 'Ghost' created")
    elif not verify_password(owner_password, existing_owner["password_hash"]):
        await db.users.update_one(
            {"username": owner_username},
            {"$set": {
                "password_hash": hash_password(owner_password),
                "security_question": owner_security_question,
                "security_answer": owner_security_answer.lower().strip(),
                "role": "owner"
            }}
        )
        logger.info(f"Owner account updated")
    
    # Seed admin account
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    existing_admin = await db.users.find_one({"username": admin_username})
    if existing_admin is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "username": admin_username,
            "password_hash": hashed,
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_online": False,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "settings": {
                "homepage": "https://www.google.com",
                "theme": "dark",
                "show_bookmarks_bar": True
            },
            "bookmarks": [],
            "history": [],
            "saved_passwords": []
        })
        logger.info(f"Admin user '{admin_username}' created")
    
    # Write credentials
    Path("/app/memory").mkdir(exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials\n\n")
        f.write("## Owner Account\n")
        f.write(f"- Username: Ghost\n")
        f.write(f"- Password: Gage2011!\n")
        f.write(f"- Security Question: What's your favorite food?\n")
        f.write(f"- Security Answer: moms steak\n")
        f.write("- Role: owner\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Username: {admin_username}\n")
        f.write(f"- Password: {admin_password}\n")
        f.write("- Role: admin\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/register\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/verify-security\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- GET /api/auth/me\n\n")
        f.write("## Admin Endpoints (Owner only)\n")
        f.write("- GET /api/admin/users\n")
        f.write("- POST /api/admin/ban\n")
        f.write("- POST /api/admin/unban/{user_id}\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
