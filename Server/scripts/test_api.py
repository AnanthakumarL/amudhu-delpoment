#!/usr/bin/env python3
"""
Comprehensive API Test Script
Tests all endpoints with multiple concurrent requests
"""

import asyncio
import sys
from datetime import datetime

import httpx

BASE_URL = "http://localhost:7999/api/v1"
COLORS = {
    "GREEN": "\033[92m",
    "RED": "\033[91m",
    "YELLOW": "\033[93m",
    "BLUE": "\033[94m",
    "END": "\033[0m",
    "BOLD": "\033[1m",
}


class APITester:
    def __init__(self):
        self.results = []
        self.created_ids = {}

    def log(self, message: str, color: str = "END"):
        print(f"{COLORS[color]}{message}{COLORS['END']}")

    def log_success(self, endpoint: str, method: str):
        self.log(f"✓ {method} {endpoint}", "GREEN")
        self.results.append({"endpoint": endpoint, "method": method, "status": "PASS"})

    def log_error(self, endpoint: str, method: str, error: str):
        self.log(f"✗ {method} {endpoint} - {error}", "RED")
        self.results.append({"endpoint": endpoint, "method": method, "status": "FAIL", "error": error})

    async def test_health(self, client: httpx.AsyncClient):
        """Test health check endpoint"""
        self.log("\n=== Testing Health Check ===", "BOLD")
        try:
            response = await client.get(f"{BASE_URL}/health")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert data["status"] in ["healthy", "degraded"], f"Invalid status: {data['status']}"
            assert "version" in data, "Missing version"
            assert "weaviate_connected" in data, "Missing weaviate_connected"
            self.log_success("/health", "GET")
            self.log(f"  Status: {data['status']}, Weaviate: {data['weaviate_connected']}", "BLUE")
        except Exception as e:
            self.log_error("/health", "GET", str(e))

    async def test_site_config(self, client: httpx.AsyncClient):
        """Test site configuration endpoints"""
        self.log("\n=== Testing Site Configuration ===", "BOLD")

        # GET site config
        try:
            response = await client.get(f"{BASE_URL}/site-config")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "id" in data, "Missing id"
            assert "company_name" in data, "Missing company_name"
            self.created_ids["site_config"] = data["id"]
            self.log_success("/site-config", "GET")
            self.log(f"  Company: {data['company_name']}", "BLUE")
        except Exception as e:
            self.log_error("/site-config", "GET", str(e))

        # UPDATE site config
        try:
            update_data = {
                "company_name": "Updated E-Commerce Store",
                "primary_color": "#ff5722",
            }
            response = await client.put(f"{BASE_URL}/site-config", json=update_data)
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert data["company_name"] == update_data["company_name"], "Update failed"
            self.log_success("/site-config", "PUT")
            self.log(f"  Updated to: {data['company_name']}", "BLUE")
        except Exception as e:
            self.log_error("/site-config", "PUT", str(e))

    async def test_sections(self, client: httpx.AsyncClient):
        """Test section endpoints"""
        self.log("\n=== Testing Sections ===", "BOLD")

        # CREATE section
        try:
            section_data = {
                "name": f"Test Section {datetime.now().strftime('%H%M%S')}",
                "description": "Test section for API testing",
                "order": 1,
                "is_active": True,
            }
            response = await client.post(f"{BASE_URL}/sections", json=section_data)
            assert response.status_code == 201, f"Expected 201, got {response.status_code}"
            data = response.json()
            assert "id" in data, "Missing id"
            self.created_ids["section"] = data["id"]
            self.log_success("/sections", "POST")
            self.log(f"  Created: {data['name']} (ID: {data['id']})", "BLUE")
        except Exception as e:
            self.log_error("/sections", "POST", str(e))

        # LIST sections
        try:
            response = await client.get(f"{BASE_URL}/sections?page=1&page_size=10")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "data" in data, "Missing data"
            assert "total" in data, "Missing total"
            self.log_success("/sections", "GET")
            self.log(f"  Found {len(data['data'])} sections", "BLUE")
        except Exception as e:
            self.log_error("/sections", "GET", str(e))

        # GET section by ID
        if "section" in self.created_ids:
            try:
                response = await client.get(f"{BASE_URL}/sections/{self.created_ids['section']}")
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                data = response.json()
                assert data["id"] == self.created_ids["section"], "ID mismatch"
                self.log_success(f"/sections/{self.created_ids['section']}", "GET")
            except Exception as e:
                self.log_error("/sections/:id", "GET", str(e))

        # UPDATE section
        if "section" in self.created_ids:
            try:
                update_data = {"name": "Updated Section Name"}
                response = await client.put(
                    f"{BASE_URL}/sections/{self.created_ids['section']}",
                    json=update_data,
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                data = response.json()
                assert data["name"] == update_data["name"], "Update failed"
                self.log_success(f"/sections/{self.created_ids['section']}", "PUT")
            except Exception as e:
                self.log_error("/sections/:id", "PUT", str(e))

    async def test_categories(self, client: httpx.AsyncClient):
        """Test category endpoints"""
        self.log("\n=== Testing Categories ===", "BOLD")

        # CREATE category
        try:
            category_data = {
                "name": f"Test Category {datetime.now().strftime('%H%M%S')}",
                "description": "Test category for API testing",
                "section_id": self.created_ids.get("section", "320742f2-26e9-4e82-aa00-830407f07425"),
                "order": 1,
                "is_active": True,
            }
            response = await client.post(f"{BASE_URL}/categories", json=category_data)
            assert response.status_code == 201, f"Expected 201, got {response.status_code}"
            data = response.json()
            assert "id" in data, "Missing id"
            self.created_ids["category"] = data["id"]
            self.log_success("/categories", "POST")
            self.log(f"  Created: {data['name']} (ID: {data['id']})", "BLUE")
        except Exception as e:
            self.log_error("/categories", "POST", str(e))

        # LIST categories
        try:
            response = await client.get(f"{BASE_URL}/categories?page=1&page_size=10")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "data" in data, "Missing data"
            self.log_success("/categories", "GET")
            self.log(f"  Found {len(data['data'])} categories", "BLUE")
        except Exception as e:
            self.log_error("/categories", "GET", str(e))

        # GET category by ID
        if "category" in self.created_ids:
            try:
                response = await client.get(f"{BASE_URL}/categories/{self.created_ids['category']}")
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                self.log_success(f"/categories/{self.created_ids['category']}", "GET")
            except Exception as e:
                self.log_error("/categories/:id", "GET", str(e))

        # UPDATE category
        if "category" in self.created_ids:
            try:
                update_data = {"name": "Updated Category Name"}
                response = await client.put(
                    f"{BASE_URL}/categories/{self.created_ids['category']}",
                    json=update_data,
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                self.log_success(f"/categories/{self.created_ids['category']}", "PUT")
            except Exception as e:
                self.log_error("/categories/:id", "PUT", str(e))

    async def test_products(self, client: httpx.AsyncClient):
        """Test product endpoints"""
        self.log("\n=== Testing Products ===", "BOLD")

        # CREATE product
        try:
            product_data = {
                "name": f"Test Product {datetime.now().strftime('%H%M%S')}",
                "description": "Test product for API testing",
                "price": 99.99,
                "category_id": self.created_ids.get("category", ""),
                "section_id": self.created_ids.get("section", ""),
                "sku": f"TEST-{datetime.now().strftime('%H%M%S')}",
                "inventory_quantity": 100,
                "is_active": True,
                "featured": True,
                "discount_percentage": 10.0,
                "attributes": {"color": "blue", "size": "M"},
            }
            response = await client.post(f"{BASE_URL}/products", json=product_data)
            assert response.status_code == 201, f"Expected 201, got {response.status_code}"
            data = response.json()
            assert "id" in data, "Missing id"
            self.created_ids["product"] = data["id"]
            self.log_success("/products", "POST")
            self.log(f"  Created: {data['name']} (ID: {data['id']})", "BLUE")
        except Exception as e:
            self.log_error("/products", "POST", str(e))

        # LIST products
        try:
            response = await client.get(f"{BASE_URL}/products?page=1&page_size=10")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "data" in data, "Missing data"
            self.log_success("/products", "GET")
            self.log(f"  Found {len(data['data'])} products", "BLUE")
        except Exception as e:
            self.log_error("/products", "GET", str(e))

        # SEARCH products
        try:
            response = await client.get(f"{BASE_URL}/products/search?q=test&limit=5")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert isinstance(data, list), "Expected list response"
            self.log_success("/products/search", "GET")
            self.log(f"  Found {len(data)} products", "BLUE")
        except Exception as e:
            self.log_error("/products/search", "GET", str(e))

        # GET product by ID
        if "product" in self.created_ids:
            try:
                response = await client.get(f"{BASE_URL}/products/{self.created_ids['product']}")
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                self.log_success(f"/products/{self.created_ids['product']}", "GET")
            except Exception as e:
                self.log_error("/products/:id", "GET", str(e))

        # UPDATE product
        if "product" in self.created_ids:
            try:
                update_data = {"price": 89.99, "inventory_quantity": 150}
                response = await client.put(
                    f"{BASE_URL}/products/{self.created_ids['product']}",
                    json=update_data,
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                self.log_success(f"/products/{self.created_ids['product']}", "PUT")
            except Exception as e:
                self.log_error("/products/:id", "PUT", str(e))

    async def test_orders(self, client: httpx.AsyncClient):
        """Test order endpoints"""
        self.log("\n=== Testing Orders ===", "BOLD")

        # CREATE order
        try:
            order_data = {
                "customer_name": "Test Customer",
                "customer_email": f"test{datetime.now().strftime('%H%M%S')}@example.com",
                "customer_phone": "+1-555-0000",
                "shipping_address": "123 Test St, Test City, TC 12345",
                "billing_address": "123 Test St, Test City, TC 12345",
                "items": [
                    {
                        "product_id": self.created_ids.get("product", "test-id"),
                        "product_name": "Test Product",
                        "quantity": 2,
                        "price": 99.99,
                        "subtotal": 199.98,
                    },
                ],
                "subtotal": 199.98,
                "tax": 16.00,
                "shipping_cost": 10.00,
                "total": 225.98,
                "status": "pending",
                "notes": "Test order",
            }
            response = await client.post(f"{BASE_URL}/orders", json=order_data)
            assert response.status_code == 201, f"Expected 201, got {response.status_code}"
            data = response.json()
            assert "id" in data, "Missing id"
            assert "order_number" in data, "Missing order_number"
            self.created_ids["order"] = data["id"]
            self.created_ids["order_number"] = data["order_number"]
            self.log_success("/orders", "POST")
            self.log(f"  Created: {data['order_number']} (ID: {data['id']})", "BLUE")
        except Exception as e:
            self.log_error("/orders", "POST", str(e))

        # LIST orders
        try:
            response = await client.get(f"{BASE_URL}/orders?page=1&page_size=10")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "data" in data, "Missing data"
            self.log_success("/orders", "GET")
            self.log(f"  Found {len(data['data'])} orders", "BLUE")
        except Exception as e:
            self.log_error("/orders", "GET", str(e))

        # GET order statistics
        try:
            response = await client.get(f"{BASE_URL}/orders/statistics")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            data = response.json()
            assert "total_orders" in data, "Missing total_orders"
            self.log_success("/orders/statistics", "GET")
            self.log(f"  Total orders: {data['total_orders']}, Revenue: ${data['total_revenue']:.2f}", "BLUE")
        except Exception as e:
            self.log_error("/orders/statistics", "GET", str(e))

        # GET order by number
        if "order_number" in self.created_ids:
            try:
                response = await client.get(
                    f"{BASE_URL}/orders/number/{self.created_ids['order_number']}",
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                self.log_success(f"/orders/number/{self.created_ids['order_number']}", "GET")
            except Exception as e:
                self.log_error("/orders/number/:order_number", "GET", str(e))

        # GET order by ID
        if "order" in self.created_ids:
            try:
                response = await client.get(f"{BASE_URL}/orders/{self.created_ids['order']}")
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                self.log_success(f"/orders/{self.created_ids['order']}", "GET")
            except Exception as e:
                self.log_error("/orders/:id", "GET", str(e))

        # UPDATE order
        if "order" in self.created_ids:
            try:
                update_data = {"status": "processing", "notes": "Order is being processed"}
                response = await client.put(
                    f"{BASE_URL}/orders/{self.created_ids['order']}",
                    json=update_data,
                )
                assert response.status_code == 200, f"Expected 200, got {response.status_code}"
                data = response.json()
                assert data["status"] == "processing", "Status update failed"
                self.log_success(f"/orders/{self.created_ids['order']}", "PUT")
            except Exception as e:
                self.log_error("/orders/:id", "PUT", str(e))

    async def test_concurrent_requests(self, client: httpx.AsyncClient):
        """Test concurrent requests"""
        self.log("\n=== Testing Concurrent Requests ===", "BOLD")

        try:
            # Make 10 concurrent requests to different endpoints
            tasks = [
                client.get(f"{BASE_URL}/health"),
                client.get(f"{BASE_URL}/site-config"),
                client.get(f"{BASE_URL}/sections?page=1&page_size=5"),
                client.get(f"{BASE_URL}/categories?page=1&page_size=5"),
                client.get(f"{BASE_URL}/products?page=1&page_size=5"),
                client.get(f"{BASE_URL}/orders?page=1&page_size=5"),
                client.get(f"{BASE_URL}/products/search?q=test&limit=3"),
                client.get(f"{BASE_URL}/orders/statistics"),
                client.get(f"{BASE_URL}/health"),
                client.get(f"{BASE_URL}/products?featured=true"),
            ]

            responses = await asyncio.gather(*tasks, return_exceptions=True)

            success_count = sum(1 for r in responses if not isinstance(r, Exception) and r.status_code == 200)

            self.log(f"  Concurrent requests: {success_count}/{len(tasks)} successful", "BLUE")

            if success_count == len(tasks):
                self.log_success("Concurrent Requests", "MULTIPLE")
            else:
                self.log_error("Concurrent Requests", "MULTIPLE",
                             f"Only {success_count}/{len(tasks)} succeeded")
        except Exception as e:
            self.log_error("Concurrent Requests", "MULTIPLE", str(e))

    async def run_all_tests(self):
        """Run all tests"""
        self.log(f"\n{COLORS['BOLD']}{'='*60}{COLORS['END']}", "BOLD")
        self.log("E-COMMERCE API COMPREHENSIVE TEST SUITE", "BOLD")
        self.log(f"Testing: {BASE_URL}", "YELLOW")
        self.log(f"{'='*60}\n", "BOLD")

        async with httpx.AsyncClient(timeout=30.0) as client:
            await self.test_health(client)
            await self.test_site_config(client)
            await self.test_sections(client)
            await self.test_categories(client)
            await self.test_products(client)
            await self.test_orders(client)
            await self.test_concurrent_requests(client)

        # Print summary
        self.log(f"\n{COLORS['BOLD']}{'='*60}{COLORS['END']}", "BOLD")
        self.log("TEST SUMMARY", "BOLD")
        self.log(f"{'='*60}", "BOLD")

        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        total = len(self.results)

        self.log(f"\nTotal Tests: {total}", "BLUE")
        self.log(f"Passed: {passed}", "GREEN")
        self.log(f"Failed: {failed}", "RED" if failed > 0 else "GREEN")

        if failed > 0:
            self.log("\nFailed Tests:", "RED")
            for result in self.results:
                if result["status"] == "FAIL":
                    self.log(f"  - {result['method']} {result['endpoint']}: {result.get('error', 'Unknown error')}", "RED")

        self.log(f"\n{'='*60}\n", "BOLD")

        return failed == 0


async def main():
    tester = APITester()

    try:
        success = await tester.run_all_tests()
        sys.exit(0 if success else 1)
    except Exception as e:
        tester.log(f"\nFatal error: {e}", "RED")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
