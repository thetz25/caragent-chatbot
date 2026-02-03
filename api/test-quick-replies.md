# Quick Replies Implementation Test Guide

## Changes Made

### 1. Greeting Message (webhook.routes.ts:147-154)
**Before:** Plain text with emoji list
**After:** Quick reply buttons with 4 options:
- 🚙 Browse Models → `SHOW_MODELS`
- 💰 Get a Quote → `GET_QUOTE`
- 📸 View Photos → `VIEW_PHOTOS`
- ❓ Ask Questions → `ASK_QUESTIONS`

### 2. Quote Flow - Payment Type (quote-flow.service.ts:98-99, 173-174)
**Before:** Plain text "1️⃣ Cash purchase\n2️⃣ Financing"
**After:** Quick reply buttons:
- 💵 Cash Purchase → `PAYMENT_CASH`
- 💳 Financing → `PAYMENT_FINANCING`

### 3. Quote Flow - Down Payment (quote-flow.service.ts:200-202)
**Before:** Plain text with bullet points
**After:** Quick reply buttons:
- 20% (Minimum) → `DOWN_PAYMENT_20`
- 30% → `DOWN_PAYMENT_30`
- 50% → `DOWN_PAYMENT_50`

### 4. Quote Flow - Financing Terms (quote-flow.service.ts:234)
**Before:** Plain text with bullet points
**After:** Quick reply buttons:
- 12 months (1 year) → `TERM_12`
- 24 months (2 years) → `TERM_24`
- 36 months (3 years) → `TERM_36`
- 48 months (4 years) → `TERM_48`
- 60 months (5 years) → `TERM_60`

### 5. Variant Suggestions (nlp.utils.ts:369-389, webhook.routes.ts:367-373)
**Before:** Plain text bullet list
**After:** Quick reply buttons with up to 10 similar variants

### 6. Quick Reply Handler (webhook.routes.ts:426-528)
New function to handle all quick reply payloads including:
- Main menu actions
- Variant selections
- Quote flow steps

## Testing Steps

### Manual Testing via Messenger

1. **Test Greeting:**
   - Send "hi" or "hello"
   - Expected: Welcome message with 4 quick reply buttons
   - Click each button to verify they work

2. **Test Quote Flow:**
   - Click "💰 Get a Quote" button
   - Enter a variant name (e.g., "Xpander GLS")
   - Expected: Quick reply buttons for Cash/Financing
   - Click "💳 Financing"
   - Expected: Quick reply buttons for down payment (20%, 30%, 50%)
   - Click "30%"
   - Expected: Quick reply buttons for financing terms (12, 24, 36, 48, 60 months)
   - Click "36 months (3 years)"
   - Expected: Quote generated and displayed

3. **Test Variant Suggestions:**
   - Ask for specs of a misspelled variant (e.g., "specs of xpander glss")
   - Expected: Quick reply buttons with similar variants

4. **Test Browse Models:**
   - From greeting, click "🚙 Browse Models"
   - Expected: List of all models with descriptions

5. **Test View Photos:**
   - From greeting, click "📸 View Photos"
   - Expected: Message asking which model to view

## Key Files Modified

1. **api/src/services/quote-flow.service.ts**
   - Added `QuoteFlowResponse` interface with optional `quickReplies`
   - Updated all handler methods to return quick replies
   - Added payload handling (PAYMENT_CASH, DOWN_PAYMENT_20, TERM_36, etc.)

2. **api/src/routes/webhook.routes.ts**
   - Updated greeting message to use `sendQuickReplies()`
   - Added `handleQuickReply()` function
   - Updated `handlePostback()` function
   - Added `quick_reply` to `MessagingEvent` interface
   - Updated quote flow message handling to check for quick replies

3. **api/src/services/nlp.utils.ts**
   - Added `generateQuickReplySuggestions()` function
   - Generates up to 10 quick reply buttons from fuzzy-matched suggestions

## Payload Format

Quick replies use the following payload naming convention:
- Main actions: `SHOW_MODELS`, `GET_QUOTE`, `VIEW_PHOTOS`, `ASK_QUESTIONS`
- Payment type: `PAYMENT_CASH`, `PAYMENT_FINANCING`
- Down payment: `DOWN_PAYMENT_20`, `DOWN_PAYMENT_30`, `DOWN_PAYMENT_50`
- Financing terms: `TERM_12`, `TERM_24`, `TERM_36`, `TERM_48`, `TERM_60`
- Variant selection: `SELECT_<VARIANT_NAME_UPPERCASE>`

## Backwards Compatibility

All text-based inputs still work:
- Users can type "cash" or "financing" instead of clicking buttons
- Users can type "30" for 30% down payment
- Users can type "36" for 36-month term
- This ensures accessibility and flexibility
