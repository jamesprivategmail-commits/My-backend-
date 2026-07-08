# Social Backend

A Node/Express backend backed by Postgres. Handles user accounts, login,
posts, likes, and comments — everything is written to your Postgres
database, so it survives restarts and works from any machine that can
reach the database.

## Setup

npm install
# .env is already set up with your DATABASE_URL — just fill in JWT_SECRET
npm start

Tables are created automatically on first run if they don't exist yet.

## Data model

- **users**: id, username, email, password_hash (bcrypt), display_name, bio, created_at
- **posts**: id, user_id, content, created_at
- **likes**: id, post_id, user_id, created_at (one like per user per post)
- **comments**: id, post_id, user_id, content, created_at

## Auth flow

1. POST /api/register → creates a user, returns { user, token }
2. POST /api/login → returns { user, token }
3. Send the token on every protected request: Authorization: Bearer <token>

## Endpoints

| Method | Path                     | Auth? | What it does                  |
|--------|--------------------------|-------|--------------------------------|
| POST   | /api/register            | no    | create account                 |
| POST   | /api/login               | no    | log in                         |
| GET    | /api/me                  | yes   | get your profile               |
| PATCH  | /api/me                  | yes   | update display_name / bio      |
| POST   | /api/posts               | yes   | create a post                  |
| GET    | /api/posts               | no    | feed (newest first)            |
| GET    | /api/posts/:id           | no    | one post + its comments        |
| DELETE | /api/posts/:id           | yes   | delete your own post           |
| POST   | /api/posts/:id/like      | yes   | like a post                    |
| DELETE | /api/posts/:id/like      | yes   | unlike a post                  |
| POST   | /api/posts/:id/comments  | yes   | comment on a post               |
| GET    | /api/health              | no    | health check                   |

## Notes

- Passwords are hashed with bcrypt — never stored in plain text.
- .env contains your live database password. Don't commit it to git or
  paste it anywhere public.
- For production: put a real random string in JWT_SECRET and add rate limiting.