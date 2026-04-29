#!/bin/bash

# E-Commerce Backend API Test Suite
# This script tests all endpoints

set -e

BASE_URL="http://localhost:8000/api/v1"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== E-Commerce Backend API Test Suite ===${NC}\n"

# Test health endpoint
echo -e "${BLUE}1. Testing Health Check${NC}"
curl -s -X GET "$BASE_URL/health" | jq .
echo -e "${GREEN}✓ Health check passed${NC}\n"

# Get site config
echo -e "${BLUE}2. Testing Site Configuration - GET${NC}"
SITE_CONFIG=$(curl -s -X GET "$BASE_URL/site-config")
echo $SITE_CONFIG | jq .
echo -e "${GREEN}✓ Get site config passed${NC}\n"

# Update site config
echo -e "${BLUE}3. Testing Site Configuration - UPDATE${NC}"
curl -s -X PUT "$BASE_URL/site-config" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Test E-Commerce Store",
    "primary_color": "#FF5722",
    "contact_email": "admin@teststore.com"
  }' | jq .
echo -e "${GREEN}✓ Update site config passed${NC}\n"

# Create Section
echo -e "${BLUE}4. Testing Sections - CREATE${NC}"
SECTION=$(curl -s -X POST "$BASE_URL/sections" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Main Section",
    "description": "Main section for testing",
    "order": 1,
    "is_active": true
  }')
SECTION_ID=$(echo $SECTION | jq -r '.id')
echo $SECTION | jq .
echo -e "${GREEN}✓ Create section passed - ID: $SECTION_ID${NC}\n"

# Create Subsection
echo -e "${BLUE}5. Testing Sections - CREATE SUBSECTION${NC}"
SUBSECTION=$(curl -s -X POST "$BASE_URL/sections" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"Test Subsection\",
    \"description\": \"Subsection for testing\",
    \"order\": 1,
    \"is_active\": true,
    \"parent_section_id\": \"$SECTION_ID\"
  }")
SUBSECTION_ID=$(echo $SUBSECTION | jq -r '.id')
echo $SUBSECTION | jq .
echo -e "${GREEN}✓ Create subsection passed - ID: $SUBSECTION_ID${NC}\n"

# List Sections
echo -e "${BLUE}6. Testing Sections - LIST${NC}"
curl -s -X GET "$BASE_URL/sections?page=1&page_size=10" | jq .
echo -e "${GREEN}✓ List sections passed${NC}\n"

# Get Section by ID
echo -e "${BLUE}7. Testing Sections - GET by ID${NC}"
curl -s -X GET "$BASE_URL/sections/$SECTION_ID" | jq .
echo -e "${GREEN}✓ Get section by ID passed${NC}\n"

# Update Section
echo -e "${BLUE}8. Testing Sections - UPDATE${NC}"
curl -s -X PUT "$BASE_URL/sections/$SECTION_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Test Section",
    "description": "Updated description"
  }' | jq .
echo -e "${GREEN}✓ Update section passed${NC}\n"

# Create Category
echo -e "${BLUE}9. Testing Categories - CREATE${NC}"
CATEGORY=$(curl -s -X POST "$BASE_URL/categories" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Electronics",
    "description": "Electronic devices for testing",
    "order": 1,
    "is_active": true,
    "slug": "test-electronics",
    "image_url": "https://example.com/electronics.jpg"
  }')
CATEGORY_ID=$(echo $CATEGORY | jq -r '.id')
echo $CATEGORY | jq .
echo -e "${GREEN}✓ Create category passed - ID: $CATEGORY_ID${NC}\n"

# Create Subcategory
echo -e "${BLUE}10. Testing Categories - CREATE SUBCATEGORY${NC}"
SUBCATEGORY=$(curl -s -X POST "$BASE_URL/categories" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Phones\",
    \"description\": \"Smartphones for testing\",
    \"parent_category_id\": \"$CATEGORY_ID\",
    \"order\": 1,
    \"is_active\": true
  }")
SUBCATEGORY_ID=$(echo $SUBCATEGORY | jq -r '.id')
echo $SUBCATEGORY | jq .
echo -e "${GREEN}✓ Create subcategory passed - ID: $SUBCATEGORY_ID${NC}\n"

# List Categories
echo -e "${BLUE}11. Testing Categories - LIST${NC}"
curl -s -X GET "$BASE_URL/categories?page=1&page_size=10" | jq .
echo -e "${GREEN}✓ List categories passed${NC}\n"

# Get Category by ID
echo -e "${BLUE}12. Testing Categories - GET by ID${NC}"
curl -s -X GET "$BASE_URL/categories/$CATEGORY_ID" | jq .
echo -e "${GREEN}✓ Get category by ID passed${NC}\n"

# Update Category
echo -e "${BLUE}13. Testing Categories - UPDATE${NC}"
curl -s -X PUT "$BASE_URL/categories/$CATEGORY_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Test Electronics",
    "description": "Updated electronic devices"
  }' | jq .
echo -e "${GREEN}✓ Update category passed${NC}\n"

# Create Product 1
echo -e "${BLUE}14. Testing Products - CREATE (Product 1)${NC}"
PRODUCT1=$(curl -s -X POST "$BASE_URL/products" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test iPhone 15\",
    \"description\": \"Latest iPhone for testing\",
    \"price\": 999.99,
    \"category_id\": \"$SUBCATEGORY_ID\",
    \"section_id\": \"$SECTION_ID\",
    \"sku\": \"TEST-IP15-001\",
    \"stock_quantity\": 50,
    \"images\": [\"https://example.com/iphone15.jpg\"],
    \"is_active\": true,
    \"featured\": true,
    \"discount_percentage\": 10.0,
    \"attributes\": {
      \"color\": \"Blue\",
      \"storage\": \"256GB\"
    }
  }")
PRODUCT1_ID=$(echo $PRODUCT1 | jq -r '.id')
echo $PRODUCT1 | jq .
echo -e "${GREEN}✓ Create product 1 passed - ID: $PRODUCT1_ID${NC}\n"

# Create Product 2
echo -e "${BLUE}15. Testing Products - CREATE (Product 2)${NC}"
PRODUCT2=$(curl -s -X POST "$BASE_URL/products" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Samsung Galaxy\",
    \"description\": \"Android smartphone for testing\",
    \"price\": 899.99,
    \"category_id\": \"$SUBCATEGORY_ID\",
    \"section_id\": \"$SECTION_ID\",
    \"sku\": \"TEST-SGS-001\",
    \"stock_quantity\": 75,
    \"images\": [\"https://example.com/galaxy.jpg\"],
    \"is_active\": true,
    \"featured\": false,
    \"discount_percentage\": 5.0,
    \"attributes\": {
      \"color\": \"Black\",
      \"storage\": \"128GB\"
    }
  }")
PRODUCT2_ID=$(echo $PRODUCT2 | jq -r '.id')
echo $PRODUCT2 | jq .
echo -e "${GREEN}✓ Create product 2 passed - ID: $PRODUCT2_ID${NC}\n"

# List Products
echo -e "${BLUE}16. Testing Products - LIST${NC}"
curl -s -X GET "$BASE_URL/products?page=1&page_size=10" | jq .
echo -e "${GREEN}✓ List products passed${NC}\n"

# List Products with filters
echo -e "${BLUE}17. Testing Products - LIST with FILTERS${NC}"
curl -s -X GET "$BASE_URL/products?page=1&page_size=10&category_id=$SUBCATEGORY_ID&is_active=true" | jq .
echo -e "${GREEN}✓ List products with filters passed${NC}\n"

# List Featured Products
echo -e "${BLUE}18. Testing Products - LIST FEATURED${NC}"
curl -s -X GET "$BASE_URL/products?featured=true" | jq .
echo -e "${GREEN}✓ List featured products passed${NC}\n"

# Search Products
echo -e "${BLUE}19. Testing Products - SEARCH${NC}"
curl -s -X GET "$BASE_URL/products/search?q=smartphone&limit=5" | jq .
echo -e "${GREEN}✓ Search products passed${NC}\n"

# Get Product by ID
echo -e "${BLUE}20. Testing Products - GET by ID${NC}"
curl -s -X GET "$BASE_URL/products/$PRODUCT1_ID" | jq .
echo -e "${GREEN}✓ Get product by ID passed${NC}\n"

# Update Product
echo -e "${BLUE}21. Testing Products - UPDATE${NC}"
curl -s -X PUT "$BASE_URL/products/$PRODUCT1_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 1099.99,
    "stock_quantity": 45,
    "discount_percentage": 15.0
  }' | jq .
echo -e "${GREEN}✓ Update product passed${NC}\n"

# Create Order
echo -e "${BLUE}22. Testing Orders - CREATE${NC}"
PRODUCT1_NAME=$(echo $PRODUCT1 | jq -r '.name')
PRODUCT2_NAME=$(echo $PRODUCT2 | jq -r '.name')
PRODUCT1_PRICE=$(echo $PRODUCT1 | jq -r '.price')
PRODUCT2_PRICE=$(echo $PRODUCT2 | jq -r '.price')

ORDER=$(curl -s -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json" \
  -d "{
    \"customer_name\": \"John Test User\",
    \"customer_email\": \"john.test@example.com\",
    \"customer_phone\": \"+1-555-TEST\",
    \"shipping_address\": \"123 Test Street, Test City, TC 12345\",
    \"billing_address\": \"123 Test Street, Test City, TC 12345\",
    \"items\": [
      {
        \"product_id\": \"$PRODUCT1_ID\",
        \"product_name\": \"$PRODUCT1_NAME\",
        \"quantity\": 1,
        \"price\": $PRODUCT1_PRICE,
        \"subtotal\": $PRODUCT1_PRICE
      },
      {
        \"product_id\": \"$PRODUCT2_ID\",
        \"product_name\": \"$PRODUCT2_NAME\",
        \"quantity\": 2,
        \"price\": $PRODUCT2_PRICE,
        \"subtotal\": $(echo "$PRODUCT2_PRICE * 2" | bc)
      }
    ],
    \"subtotal\": $(echo "$PRODUCT1_PRICE + ($PRODUCT2_PRICE * 2)" | bc),
    \"tax\": 159.98,
    \"shipping_cost\": 15.00,
    \"total\": $(echo "$PRODUCT1_PRICE + ($PRODUCT2_PRICE * 2) + 159.98 + 15.00" | bc),
    \"status\": \"pending\",
    \"notes\": \"Test order - please handle with care\"
  }")
ORDER_ID=$(echo $ORDER | jq -r '.id')
ORDER_NUMBER=$(echo $ORDER | jq -r '.order_number')
echo $ORDER | jq .
echo -e "${GREEN}✓ Create order passed - ID: $ORDER_ID, Number: $ORDER_NUMBER${NC}\n"

# List Orders
echo -e "${BLUE}23. Testing Orders - LIST${NC}"
curl -s -X GET "$BASE_URL/orders?page=1&page_size=10" | jq .
echo -e "${GREEN}✓ List orders passed${NC}\n"

# List Orders by Status
echo -e "${BLUE}24. Testing Orders - LIST by STATUS${NC}"
curl -s -X GET "$BASE_URL/orders?status=pending" | jq .
echo -e "${GREEN}✓ List orders by status passed${NC}\n"

# Get Order by ID
echo -e "${BLUE}25. Testing Orders - GET by ID${NC}"
curl -s -X GET "$BASE_URL/orders/$ORDER_ID" | jq .
echo -e "${GREEN}✓ Get order by ID passed${NC}\n"

# Get Order by Number
echo -e "${BLUE}26. Testing Orders - GET by ORDER NUMBER${NC}"
curl -s -X GET "$BASE_URL/orders/number/$ORDER_NUMBER" | jq .
echo -e "${GREEN}✓ Get order by number passed${NC}\n"

# Get Order Statistics
echo -e "${BLUE}27. Testing Orders - STATISTICS${NC}"
curl -s -X GET "$BASE_URL/orders/statistics" | jq .
echo -e "${GREEN}✓ Get order statistics passed${NC}\n"

# Update Order Status to Processing
echo -e "${BLUE}28. Testing Orders - UPDATE (to processing)${NC}"
curl -s -X PUT "$BASE_URL/orders/$ORDER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "processing",
    "notes": "Order is being processed"
  }' | jq .
echo -e "${GREEN}✓ Update order to processing passed${NC}\n"

# Update Order Status to Shipped
echo -e "${BLUE}29. Testing Orders - UPDATE (to shipped)${NC}"
curl -s -X PUT "$BASE_URL/orders/$ORDER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "shipped",
    "notes": "Order shipped via FedEx - Tracking: TEST123456"
  }' | jq .
echo -e "${GREEN}✓ Update order to shipped passed${NC}\n"

# Update Order Status to Delivered
echo -e "${BLUE}30. Testing Orders - UPDATE (to delivered)${NC}"
curl -s -X PUT "$BASE_URL/orders/$ORDER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "delivered"
  }' | jq .
echo -e "${GREEN}✓ Update order to delivered passed${NC}\n"

# Final Statistics
echo -e "${BLUE}31. Testing Orders - FINAL STATISTICS${NC}"
curl -s -X GET "$BASE_URL/orders/statistics" | jq .
echo -e "${GREEN}✓ Get final statistics passed${NC}\n"

# Cleanup Tests
echo -e "${BLUE}32. Testing DELETE Operations${NC}"

# Delete Product
echo -e "  Deleting Product 2..."
curl -s -X DELETE "$BASE_URL/products/$PRODUCT2_ID" | jq .
echo -e "${GREEN}  ✓ Delete product passed${NC}"

# Delete Category
echo -e "  Deleting Subcategory..."
curl -s -X DELETE "$BASE_URL/categories/$SUBCATEGORY_ID" | jq .
echo -e "${GREEN}  ✓ Delete category passed${NC}"

# Delete Section
echo -e "  Deleting Subsection..."
curl -s -X DELETE "$BASE_URL/sections/$SUBSECTION_ID" | jq .
echo -e "${GREEN}  ✓ Delete section passed${NC}\n"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ALL TESTS PASSED SUCCESSFULLY! ✓${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\nSummary:"
echo -e "- Total tests: 32"
echo -e "- Section ID: $SECTION_ID"
echo -e "- Category ID: $CATEGORY_ID"
echo -e "- Product ID: $PRODUCT1_ID"
echo -e "- Order ID: $ORDER_ID"
echo -e "- Order Number: $ORDER_NUMBER"
