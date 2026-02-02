# Milestone 5: LLM Q&A + Guardrails - Implementation Summary

## ✅ Completed Features

### 1. LLM Client Service (`llm.service.ts`)
**Location:** `api/src/services/llm.service.ts`

**Features:**
- Multi-provider support (OpenAI, Anthropic, Gemini)
- Intent detection with entity extraction
- RAG-based FAQ answer generation
- Fallback keyword-based detection when LLM unavailable

**Intent Categories:**
- `show_models` - User wants to see available cars
- `show_specs` - User asks for specifications
- `show_photos` - User wants to see images
- `get_quote` - User wants pricing/quotation
- `general_question` - FAQ-style questions
- `greeting` - Hello/hi/start
- `unknown` - Doesn't match any category

**Entity Extraction:**
- Model name (e.g., "Xpander", "Montero")
- Variant name (e.g., "GLS A/T")
- Payment type ("cash" or "financing")

### 2. RAG Service (`rag.service.ts`)
**Location:** `api/src/services/rag.service.ts`

**Features:**
- Keyword-based FAQ search
- Relevance scoring algorithm
- Category-based FAQ organization
- Initial FAQ seeding (12 FAQs)

**FAQ Categories:**
- Warranty
- Maintenance
- Fuel Economy
- Test Drive
- Financing
- Features
- Safety
- Trade-in
- Colors
- Technology

**Sample FAQs:**
- "What is the warranty for Mitsubishi vehicles?"
- "How often should I service my Mitsubishi?"
- "Do you offer test drives?"
- "What financing options are available?"

### 3. Guardrails Service (`guardrails.service.ts`)
**Location:** `api/src/services/guardrails.service.ts`

**Features:**
- **Content Safety Check:** Blocks harmful/off-topic content
- **Pricing Guardrails:** 
  - Validates if variant is specified
  - Checks if price data is recent (warns if >30 days old)
  - Suggests quote flow for detailed pricing
- **Specs Guardrails:**
  - Validates if variant is specified
  - Checks if specs data exists
  - Provides graceful fallbacks
- **Price Validation:** Compares claimed prices against database
- **Input Sanitization:** Removes HTML/scripts, limits length

**Safety Topics Blocked:**
- Hacking/cracking
- Illegal activities
- Fraud/scams
- Weapons/dangerous content

## 📁 Files Created/Modified

### New Files:
1. `api/src/services/llm.service.ts` - LLM integration
2. `api/src/services/rag.service.ts` - FAQ retrieval
3. `api/src/services/guardrails.service.ts` - Safety & validation
4. `api/prisma/migrations/20260202122706_add_faq_model/` - FAQ table migration

### Modified Files:
1. `api/src/routes/webhook.routes.ts` - Integrated LLM/RAG/guardrails
2. `api/prisma/schema.prisma` - Added FAQ model
3. `api/prisma/seed.ts` - Added FAQ seeding
4. `.env` / `api/.env` - Added OPENAI_API_KEY
5. `docker-compose.yml` - Added OPENAI_API_KEY env var

## 🔧 Configuration

### Environment Variables:
```bash
# Required for AI features
OPENAI_API_KEY=your_openai_api_key_here

# Optional (defaults to OpenAI GPT-3.5)
# LLM_PROVIDER=openai
# LLM_MODEL=gpt-3.5-turbo
```

### Get OpenAI API Key:
1. Visit https://platform.openai.com
2. Sign up/create account
3. Go to API Keys section
4. Create new secret key
5. Add to `.env` file

## 🚀 How It Works

### Message Processing Flow:

1. **Content Safety Check**
   - Blocks harmful/off-topic messages
   - Returns appropriate warning

2. **Quote Flow Check**
   - If user is mid-quote, continue quote flow
   - Otherwise, proceed to intent detection

3. **Intent Detection**
   - If OPENAI_API_KEY exists: Use LLM for accurate detection
   - Else: Use keyword-based fallback
   - Extract entities (model, variant, payment type)

4. **Intent Handling**
   - **Greeting:** Welcome message with options
   - **Show Models:** List available cars
   - **Show Photos:** Display image carousel
   - **Show Specs:** Guardrails check → Display specs
   - **Get Quote:** Start quote flow
   - **General Question:** RAG search → LLM answer generation

5. **RAG for FAQs**
   - Search relevant FAQs by keywords
   - Score matches (exact=3, partial=2, question=1.5, answer=0.5)
   - Use LLM to generate natural answer from context
   - Fallback to direct FAQ answer if LLM fails

6. **Guardrails**
   - Pricing questions require specific variant
   - Warn if price data is outdated
   - Suggest quote flow for detailed pricing
   - Specs questions require variant with data

## 💡 Usage Examples

### Without LLM (Keyword Fallback):
```
User: "hi"
Bot: "Hello! Welcome to Mitsubishi Motors..."

User: "what is the warranty?"
Bot: [Searches FAQs] → Returns warranty FAQ answer

User: "price of xpander"
Bot: [Guardrails] → Asks for specific variant
```

### With LLM:
```
User: "I'm looking for a family car with good fuel economy"
Bot: [LLM detects: show_models + Xpander entity] 
     → "Great choice for families! The Xpander is our 7-seater MPV..."

User: "What's the monthly payment for the GLS?"
Bot: [LLM detects: get_quote + Xpander GLS variant]
     → Starts quote flow for financing

User: "Do you have any promotions right now?"
Bot: [LLM detects: general_question + pricing intent]
     → [RAG] → Returns current promo info
```

## 🛡️ Guardrails in Action

### Pricing Safety:
```
User: "How much is the Xpander?"
Bot: "The Xpander has multiple variants. Please specify which one:
      • GLX M/T - ₱1,068,000
      • GLS A/T - ₱1,198,000
      
      Type "quote" for a detailed breakdown with all fees!"

User: "What's the price of Xpander in Davao?"
Bot: [Checks guardrails] 
     → "Prices may vary by location. The SRP starts at ₱1,068,000.
        Please contact our Davao dealership for local pricing."
```

### Content Safety:
```
User: "How can I hack the car's computer?"
Bot: [Blocked by content safety]
     → "I can only assist with Mitsubishi vehicles, pricing, and related services. 
        Please ask about our cars or type "help" for available options."
```

## 📊 Performance Notes

- **Without LLM:** All processing is local, very fast (<100ms)
- **With LLM:** Intent detection adds ~500ms-1s latency
- **RAG Search:** Local database query, very fast (<50ms)
- **LLM Answer Generation:** Adds ~1-2s for FAQ responses

## 🔮 Future Enhancements

- Vector embeddings for better FAQ matching
- Multi-language support
- Conversation memory/context
- Intent confidence thresholds
- Custom training for automotive domain
- Integration with actual dealership inventory

## 📝 Testing

### Test Commands:
```bash
# Start the server
docker-compose up

# Test health endpoint
curl http://localhost:3000/health

# Test without Facebook (direct API test)
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "test",
      "time": 123,
      "messaging": [{
        "sender": {"id": "test_user"},
        "recipient": {"id": "page"},
        "timestamp": 123,
        "message": {"mid": "m1", "text": "What is the warranty?"}
      }]
    }]
  }'
```

## ✅ Checklist

- [x] LLM Client supports OpenAI, Anthropic, Gemini
- [x] Intent detection with 7 categories
- [x] Entity extraction (model, variant, payment)
- [x] RAG service with keyword search
- [x] 12 initial FAQs seeded
- [x] Content safety guardrails
- [x] Pricing guardrails (variant check, data freshness)
- [x] Specs guardrails (data availability)
- [x] Input sanitization
- [x] Graceful fallbacks when LLM unavailable
- [x] TypeScript compilation passes
- [x] Database migration created
- [x] Environment variables documented
