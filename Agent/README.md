# Ice Cream AI Agent

Production-ready AI-powered WhatsApp ordering agent with Admin Panel for ice cream business.

## Features

- **AI WhatsApp Agent**: WhatsApp webhook-based ordering system
- **LLM Intent Parser**: Uses DeepSeek (primary) or OpenAI (fallback) for intent understanding
- **Rule-Based Flow Engine**: Controls conversation flow without LLM control
- **MongoDB Storage**: All data persisted in MongoDB (users, orders, sessions)
- **Admin Panel**: Real-time dashboard for managing users, orders, and flow configuration
- **Live Data View**: Real-time collected data display per user

## Architecture

```
agent/
├── src/
│   ├── api/              # FastAPI routes
│   │   ├── users.py      # User CRUD endpoints
│   │   ├── orders.py     # Order management endpoints
│   │   ├── sessions.py   # Session management endpoints
│   │   ├── flow.py        # Flow configuration endpoints
│   │   ├── webhook.py     # WhatsApp webhook handler
│   │   └── collected_data.py  # Collection config endpoints
│   ├── core/
│   │   └── config.py     # Settings and configuration
│   ├── models/
│   │   └── schemas.py    # Pydantic models
│   ├── services/
│   │   ├── mongo_service.py   # MongoDB operations
│   │   ├── intent_parser.py   # LLM intent parsing
│   │   └── flow_engine.py    # Rule-based flow engine
│   ├── webhook/
│   │   └── whatsapp.py   # WhatsApp webhook handler
│   └── main.py           # FastAPI application
└── requirements.txt      # Python dependencies
```

## Setup

1. **Install dependencies**:
```bash
cd agent
pip install -r requirements.txt
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. **Run the agent**:
```bash
python src/main.py
# Or: npm run bot (if using Node wrapper)
```

4. **Access Admin Panel**:
Navigate to http://localhost:5173/ai-agent (Admin Panel)

## API Endpoints

### Users
- `GET /api/users/` - List all users
- `GET /api/users/{phone}` - Get user by phone
- `POST /api/users/` - Create user
- `PUT /api/users/{phone}` - Update user
- `DELETE /api/users/{phone}` - Delete user

### Orders
- `GET /api/orders/` - List all orders
- `GET /api/orders/{order_id}` - Get order by ID
- `PUT /api/orders/{order_id}/status` - Update order status
- `DELETE /api/orders/{order_id}` - Delete order

### Sessions
- `GET /api/sessions/` - List active sessions
- `GET /api/sessions/{phone}` - Get session by phone
- `PUT /api/sessions/{phone}/collected-data` - Update collected data
- `POST /api/sessions/{phone}/reset` - Reset session
- `POST /api/sessions/{phone}/send-message` - Send test message

### Flow Configuration
- `GET /api/flow/steps` - Get flow steps
- `POST /api/flow/steps` - Create flow step
- `PUT /api/flow/steps/{step_key}` - Update flow step
- `DELETE /api/flow/steps/{step_key}` - Delete flow step
- `POST /api/flow/steps/reset` - Reset to default

### Webhook
- `GET /webhook/whatsapp` - Webhook verification
- `POST /webhook/whatsapp` - Handle incoming messages
- `POST /webhook/test-message` - Test message endpoint

## Order Flow Steps

1. Product Selection
2. Variant Selection
3. Quantity Selection
4. Add-ons
5. Scooper
6. Delivery Address
7. Delivery Date
8. Delivery Time
9. Name
10. Email
11. Order Type (B2B/B2C)
12. GST (if B2B)
13. Order Summary
14. Confirmation

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017 |
| MONGODB_DB | Database name | icecream_agent |
| DEEPSEEK_API_KEY | DeepSeek API key | Required |
| DEEPSEEK_MODEL | DeepSeek model | deepseek-chat |
| OPENAI_API_KEY | OpenAI API key | Required |
| OPENAI_TEXT_MODEL | OpenAI text model | gpt-4.1-nano |
| WHATSAPP_WEBHOOK_VERIFY_TOKEN | Webhook verification token | whatsapp_verify_token_123 |
| PORT | Server port | 7998 |

## Database Collections

- **users_whatsapp**: WhatsApp user profiles
- **orders**: Orders created via WhatsApp
- **sessions**: Live conversation sessions
- **flow_config**: Flow steps configuration
