# Facebook Messenger Chatbot Setup Guide

## Step 1: Create Facebook App & Page

### 1.1 Create a Facebook Page (if you don't have one)
1. Go to https://www.facebook.com/pages/create
2. Choose "Business or Brand"
3. Enter:
   - Page Name: "Mitsubishi Chatbot" (or your preferred name)
   - Category: "Automotive Dealership"
4. Click "Create Page"

### 1.2 Create Facebook App
1. Go to https://developers.facebook.com/apps
2. Click "Create App"
3. Select app type: "Business"
4. Fill in:
   - Display Name: "MitsubishiChatbot"
   - App Contact Email: your email
5. Click "Create App"

## Step 2: Add Messenger Product

1. In your app dashboard, click "Add Product"
2. Find "Messenger" and click "Set Up"
3. Under "Access Tokens" section:
   - Click "Add or Remove Pages"
   - Select the page you created
   - Click "Generate Token"
   - **Copy this token** → This is your `META_PAGE_ACCESS_TOKEN`

## Step 3: Configure Webhook

### 3.1 Set Environment Variables

Edit your `.env` files and fill in:

```bash
# In both root/.env and api/.env
META_PAGE_ACCESS_TOKEN=YOUR_GENERATED_TOKEN_HERE
META_VERIFY_TOKEN=create_a_random_string_here
META_APP_SECRET=found_in_app_settings_basic
```

**Notes:**
- `META_VERIFY_TOKEN`: Create any random string (e.g., "mitsubishi_webhook_2024")
- `META_APP_SECRET`: Find this in App Dashboard → Settings → Basic → App Secret

### 3.2 Set Up Ngrok (for local testing)

```bash
# Install ngrok if you haven't (requires signup at ngrok.com)
# On Windows with Chocolatey:
choco install ngrok

# On Mac:
brew install ngrok

# Login (get authtoken from ngrok.com/dashboard)
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN

# Start ngrok to expose localhost:3000
ngrok http 3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`) - you'll need this.

### 3.3 Configure Webhook in Facebook

1. In Messenger settings, scroll to "Webhooks" section
2. Click "Add Callback URL"
3. Enter:
   - **Callback URL**: `https://your-ngrok-url.ngrok.io/webhook`
   - **Verify Token**: The same random string you set in `.env`
4. Click "Verify and Save"

### 3.4 Subscribe to Events

1. Under "Webhooks" → "Fields" section
2. Click "Subscribe to events"
3. Select:
   - ✅ messages
   - ✅ messaging_postbacks
   - ✅ messaging_optins (optional)
4. Click "Save"

### 3.5 Add Page Subscription

1. Under "Webhooks" section
2. Select your page from dropdown
3. Click "Subscribe"

## Step 4: Test Your Bot

### 4.1 Start Your Local Server

```bash
# In the project root directory:
docker-compose up

# Or if running locally without Docker:
cd api
npm run dev
```

### 4.2 Verify Everything Works

1. Open ngrok URL in browser: `https://abc123.ngrok.io/health`
   - Should see: `{"status":"ok"}`

2. Go to your Facebook Page
3. Click "Message" button
4. Send test messages:
   - Type "hello" → Should get welcome message
   - Type "models" → Should see car models list
   - Type "Xpander" → Should see variants
   - Type "photos Xpander" → Should see photo gallery
   - Type "specs Xpander GLS A/T" → Should see specs

## Step 5: Troubleshooting

### Webhook verification failed
- Double-check verify token matches in both `.env` and Facebook
- Ensure ngrok is running and URL is correct
- Check server is running on port 3000

### Messages not being received
- Verify page subscription is active in webhook settings
- Check ngrok logs for incoming requests
- Check Docker/api logs: `docker-compose logs -f api`

### "Not supported" or permission errors
- Go to App Dashboard → Roles → Test Users
- Add yourself as a Test User
- Or submit app for review (for production)

### Check ngrok requests
```bash
# In another terminal while ngrok is running
ngrok http 3000 --log=stdout
```

## Production Deployment

For production, replace ngrok with:
- Cloud server (AWS, DigitalOcean, etc.)
- Custom domain with HTTPS
- Update webhook URL in Facebook settings

## Useful Links

- Facebook Developer Console: https://developers.facebook.com/apps
- Messenger Platform Docs: https://developers.facebook.com/docs/messenger-platform
- Ngrok Documentation: https://ngrok.com/docs
