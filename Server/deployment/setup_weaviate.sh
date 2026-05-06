#!/bin/bash
set -e

echo "🚀 Setting up Weaviate Database..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Set up the repository
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add current user to docker group
    sudo usermod -aG docker $USER
    echo "✅ Docker installed successfully"
    echo "⚠️  Please log out and log back in for docker group changes to take effect"
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose installed"
fi

# Create docker-compose.yml for Weaviate
echo "📝 Creating Weaviate configuration..."
cat > /tmp/weaviate-docker-compose.yml << 'EOF'
version: '3.4'
services:
  weaviate:
    image: semitechnologies/weaviate:1.24.10
    container_name: weaviate
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "50051:50051"
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true'
      PERSISTENCE_DATA_PATH: '/var/lib/weaviate'
      DEFAULT_VECTORIZER_MODULE: 'text2vec-transformers'
      ENABLE_MODULES: 'text2vec-transformers'
      TRANSFORMERS_INFERENCE_API: 'http://t2v-transformers:8080'
      CLUSTER_HOSTNAME: 'node1'
    volumes:
      - weaviate_data:/var/lib/weaviate
  
  t2v-transformers:
    image: semitechnologies/transformers-inference:sentence-transformers-multi-qa-MiniLM-L6-cos-v1
    container_name: weaviate-transformers
    restart: unless-stopped
    environment:
      ENABLE_CUDA: '0'

volumes:
  weaviate_data:
EOF

# Stop existing Weaviate if running
echo "🛑 Stopping existing Weaviate containers..."
sudo docker-compose -f /tmp/weaviate-docker-compose.yml down 2>/dev/null || true

# Start Weaviate
echo "🚀 Starting Weaviate..."
sudo docker-compose -f /tmp/weaviate-docker-compose.yml up -d

# Wait for Weaviate to be ready
echo "⏳ Waiting for Weaviate to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:8080/v1/.well-known/ready > /dev/null 2>&1; then
        echo "✅ Weaviate is ready!"
        break
    fi
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ Weaviate failed to start within expected time"
    echo "Check logs with: docker-compose -f /tmp/weaviate-docker-compose.yml logs"
    exit 1
fi

# Save docker-compose file to proper location
sudo mkdir -p /opt/weaviate
sudo cp /tmp/weaviate-docker-compose.yml /opt/weaviate/docker-compose.yml

echo ""
echo "✨ Weaviate setup complete!"
echo "📊 Weaviate is running on: http://localhost:8080"
echo "🔍 Check status: curl http://localhost:8080/v1/.well-known/ready"
echo "📜 View logs: sudo docker-compose -f /opt/weaviate/docker-compose.yml logs -f"
echo ""
