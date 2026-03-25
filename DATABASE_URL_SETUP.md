# Database URL Setup for Render Production

## For Local Development

Set individual PostgreSQL environment variables in `.env`:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskflow_db
DB_USER=postgres
DB_PASSWORD=your_password
```

## For Render Production

Render automatically creates a `DATABASE_URL` environment variable. You can find it in your Render dashboard:

1. Go to https://dashboard.render.com
2. Select your PostgreSQL database
3. Scroll to "Connections" section
4. Copy the **External Database URL** (looks like `postgresql://user:password@host:port/dbname`)
5. This is automatically available as `DATABASE_URL` in your backend environment

### Example Render DATABASE_URL:
```
postgresql://taskflow_user:abc123xyz@dpg-xxxxx-a.render.com:5432/taskflow_db
```

## Auto-Detection

The backend `db/index.js` automatically:
- ✅ Uses `DATABASE_URL` if it exists (Render production)
- ✅ Falls back to individual DB_* variables if DATABASE_URL is not set (local development)
- ✅ Enables SSL for Render connections automatically

## Running Migrations

### Local Development:
```powershell
cd backend
node apply-manufacturing-migration.js
```

### Render Production:
Since `DATABASE_URL` is now supported, you can:

**Option 1: Via Node.js (Recommended)**
```powershell
cd backend
node apply-manufacturing-migration.js
# Automatically uses DATABASE_URL from environment
```

**Option 2: Via Render Console**
1. Dashboard → Database → Console
2. Paste contents of `backend/db/render-migration-manufacturing.sql`
3. Execute

**Option 3: Via psql CLI**
```bash
psql "YOUR_DATABASE_URL < backend/db/render-migration-manufacturing.sql
```

## Troubleshooting

**Connection refused?**
- Verify DATABASE_URL is set in Render environment variables
- Check that your IP is whitelisted (Render handles this automatically)

**SSL certificate error?**
- Backend now sets `rejectUnauthorized: false` for Render's SSL
- This is required for Render's managed PostgreSQL

**Tables not found after migration?**
- Run the migration script: `node apply-manufacturing-migration.js`
- Or execute the SQL directly in Render console
