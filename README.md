# E-Commerce Backend with Admin Dashboard

A production-ready e-commerce backend API with comprehensive admin dashboard capabilities, built with FastAPI and Weaviate vector database.

## Features

### Admin Dashboard Capabilities
- **Site Configuration Management**: Customize company name, logo, colors, contact info
- **Section Management**: Create hierarchical sections and subsections for website organization
- **Category Management**: Organize products with categories and subcategories
- **Product Management**: Full CRUD operations for products with images, SKU, inventory
- **Order Management**: Process and track orders with multiple status states
- **Search**: Semantic search for products using Weaviate's vector search

### Technical Features
- RESTful API with FastAPI
- Weaviate vector database for fast semantic search
- Comprehensive error handling
- Structured logging
- CORS support
- Auto-generated OpenAPI documentation
- Pagination support
- Production-ready folder structure

## Project Structure

```
mac/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── site_config.py    # Site configuration endpoints
│   │       │   ├── sections.py       # Section management endpoints
│   │       │   ├── categories.py     # Category management endpoints
│   │       │   ├── products.py       # Product management endpoints
│   │       │   ├── orders.py         # Order management endpoints
│   │       │   └── health.py         # Health check endpoint
│   │       └── api.py                # API router aggregator
│   ├── core/
│   │   ├── config.py                 # Application configuration
│   │   ├── exceptions.py             # Custom exceptions
│   │   └── logging.py                # Logging configuration
│   ├── db/
│   │   ├── weaviate_client.py        # Weaviate client singleton
│   │   └── schema.py                 # Database schema definitions
│   ├── models/
│   │   ├── site_config.py            # Site config Pydantic models
│   │   ├── section.py                # Section Pydantic models
│   │   ├── category.py               # Category Pydantic models
│   │   ├── product.py                # Product Pydantic models
│   │   ├── order.py                  # Order Pydantic models
│   │   └── common.py                 # Common response models
│   ├── services/
│   │   ├── site_config_service.py    # Site config business logic
│   │   ├── section_service.py        # Section business logic
│   │   ├── category_service.py       # Category business logic
│   │   ├── product_service.py        # Product business logic
│   │   └── order_service.py          # Order business logic
│   ├── utils/
│   │   └── helpers.py                # Utility functions
│   └── main.py                       # Application entry point
├── scripts/
│   ├── init_db.py                    # Database initialization script
│   └── seed_data.py                  # Data seeding script
├── tests/                            # Test directory
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore file
├── pyproject.toml                    # Project dependencies
└── README.md                         # This file
```

## Prerequisites

- Python 3.11+
- Weaviate running on localhost:8080
- uv package manager (recommended) or pip

## Installation

### 1. Clone and Setup

```bash
cd /home/developer/J2W/personal/mac
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` if needed to customize settings.

### 3. Install Dependencies

Using uv (recommended):
```bash
uv sync
```

Or using pip:
```bash
pip install -e .
```

### 4. Ensure Weaviate is Running

Make sure Weaviate is running on port 8080. You can verify by visiting:
```bash
curl http://localhost:8080/v1/meta
```

### 5. Initialize Database

```bash
python scripts/init_db.py
```

### 6. (Optional) Seed Sample Data

```bash
python scripts/seed_data.py
```

## Running the Application

### Development Mode

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 7999
```

Or:

```bash
python main.py
```

### Production Mode

```bash
uvicorn app.main:app --host 0.0.0.0 --port 7999 --workers 4
```

## API Documentation

Once the application is running, visit:

- **Swagger UI**: http://localhost:7999/docs
- **ReDoc**: http://localhost:7999/redoc
- **OpenAPI JSON**: http://localhost:7999/openapi.json

## API Endpoints

### Health Check
- `GET /api/v1/health` - Check API and database health

### Site Configuration
- `GET /api/v1/site-config` - Get site configuration
- `POST /api/v1/site-config` - Create site configuration
- `PUT /api/v1/site-config` - Update site configuration

### Sections
- `POST /api/v1/sections` - Create section
- `GET /api/v1/sections` - List sections (paginated)
- `GET /api/v1/sections/{id}` - Get section by ID
- `PUT /api/v1/sections/{id}` - Update section
- `DELETE /api/v1/sections/{id}` - Delete section

### Categories
- `POST /api/v1/categories` - Create category
- `GET /api/v1/categories` - List categories (paginated)
- `GET /api/v1/categories/{id}` - Get category by ID
- `PUT /api/v1/categories/{id}` - Update category
- `DELETE /api/v1/categories/{id}` - Delete category

### Products
- `POST /api/v1/products` - Create product
- `GET /api/v1/products` - List products (paginated, with filters)
- `GET /api/v1/products/search?q={query}` - Search products
- `GET /api/v1/products/{id}` - Get product by ID
- `PUT /api/v1/products/{id}` - Update product
- `DELETE /api/v1/products/{id}` - Delete product

### Orders
- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders` - List orders (paginated, with filters)
- `GET /api/v1/orders/statistics` - Get order statistics
- `GET /api/v1/orders/number/{order_number}` - Get order by order number
- `GET /api/v1/orders/{id}` - Get order by ID
- `PUT /api/v1/orders/{id}` - Update order
- `DELETE /api/v1/orders/{id}` - Delete order

## Environment Variables

See `.env.example` for all available environment variables:

- `WEAVIATE_HOST`: Weaviate server host (default: localhost)
- `WEAVIATE_PORT`: Weaviate server port (default: 8080)
- `DEBUG`: Enable debug mode (default: True)
- `CORS_ORIGINS`: Allowed CORS origins
- `DEFAULT_PAGE_SIZE`: Default pagination size (default: 20)
- `MAX_PAGE_SIZE`: Maximum pagination size (default: 100)

## Development

### Code Style
The project follows Python best practices with:
- Type hints
- Pydantic models for validation
- Service layer for business logic
- Repository pattern with Weaviate
- Comprehensive error handling

### Adding New Endpoints
1. Create model in `app/models/`
2. Create service in `app/services/`
3. Create endpoint in `app/api/v1/endpoints/`
4. Register router in `app/api/v1/api.py`

## Testing

```bash
# Run tests (when implemented)
pytest
```

## Logging

Logs are stored in the `logs/` directory:
- `logs/app.log` - Application logs

## License

MIT

## Support

For issues and questions, please refer to the API documentation at `/docs`.
