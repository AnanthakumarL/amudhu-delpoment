#!/bin/bash
set -e

echo "🚀 Deploying Backend to Production..."

# Configuration
APP_DIR="/opt/techstore-backend"
APP_USER="techstore"
PYTHON_VERSION="3.11"
PORT=8000
WORKERS=4  # For 10 concurrent users, 4 workers is sufficient

# Get the current script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📍 Project root: $PROJECT_ROOT"

# Install system dependencies
echo "📦 Installing system dependencies..."
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv python3-pip git curl

# Create application user if doesn't exist
if ! id "$APP_USER" &>/dev/null; then
    echo "👤 Creating application user: $APP_USER"
    sudo useradd -r -m -s /bin/bash $APP_USER
fi

# Create application directory
echo "📁 Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown -R $APP_USER:$APP_USER $APP_DIR

# Copy application files
echo "📋 Copying application files..."
sudo -u $APP_USER cp -r $PROJECT_ROOT/app $APP_DIR/
sudo -u $APP_USER cp -r $PROJECT_ROOT/scripts $APP_DIR/
sudo -u $APP_USER cp $PROJECT_ROOT/main.py $APP_DIR/
sudo -u $APP_USER cp $PROJECT_ROOT/pyproject.toml $APP_DIR/

# Create virtual environment
echo "🐍 Creating Python virtual environment..."
sudo -u $APP_USER python3.11 -m venv $APP_DIR/venv

# Install Python dependencies
echo "📦 Installing Python dependencies..."
sudo -u $APP_USER $APP_DIR/venv/bin/pip install --upgrade pip
sudo -u $APP_USER $APP_DIR/venv/bin/pip install -e $APP_DIR

# Create environment file
echo "⚙️  Creating environment configuration..."
sudo -u $APP_USER tee $APP_DIR/.env > /dev/null << 'EOF'
# Backend Configuration
PORT=8000
HOST=0.0.0.0
WORKERS=4
WEAVIATE_HOST=localhost
WEAVIATE_PORT=8080
WEAVIATE_SCHEME=http

# CORS - Update with your frontend domains
CORS_ORIGINS=["http://localhost:3000","http://localhost:3001","http://localhost:8000"]

# API Settings
API_TITLE=TechStore India API
API_VERSION=1.0.0
EOF

# Create systemd service file
echo "🔧 Creating systemd service..."
sudo tee /etc/systemd/system/techstore-backend.service > /dev/null << EOF
[Unit]
Description=TechStore Backend API
After=network.target docker.service
Requires=docker.service

[Service]
Type=notify
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/venv/bin/uvicorn main:app \\
    --host 0.0.0.0 \\
    --port $PORT \\
    --workers $WORKERS \\
    --log-level info \\
    --access-log

# Restart policy
Restart=always
RestartSec=10
StartLimitInterval=400
StartLimitBurst=3

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=techstore-backend

[Install]
WantedBy=multi-user.target
EOF

# Create log directory
sudo mkdir -p /var/log/techstore
sudo chown $APP_USER:$APP_USER /var/log/techstore

# Reload systemd
echo "🔄 Reloading systemd..."
sudo systemctl daemon-reload

# Stop existing service if running
sudo systemctl stop techstore-backend 2>/dev/null || true

# Start and enable service
echo "🚀 Starting backend service..."
sudo systemctl enable techstore-backend
sudo systemctl start techstore-backend

# Wait for service to be ready
echo "⏳ Waiting for backend to be ready..."
max_attempts=20
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -s http://localhost:$PORT/health > /dev/null 2>&1; then
        echo "✅ Backend is ready!"
        break
    fi
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "⚠️  Backend may not be fully ready yet"
    echo "Check status: sudo systemctl status techstore-backend"
    echo "Check logs: sudo journalctl -u techstore-backend -f"
fi

# Populate sample data
echo "📊 Populating sample data..."
sudo -u $APP_USER $APP_DIR/venv/bin/python -c "
import sys
sys.path.insert(0, '$APP_DIR')
from scripts.populate_sample_data import populate_sample_data
populate_sample_data()
" || echo "⚠️  Sample data population failed (you can run it manually later)"

echo ""
echo "✨ Backend deployment complete!"
echo ""
echo "📊 Service Status:"
sudo systemctl status techstore-backend --no-pager
echo ""
echo "🌐 Backend URL: http://localhost:$PORT"
echo "📚 API Docs: http://localhost:$PORT/docs"
echo "❤️  Health Check: http://localhost:$PORT/health"
echo ""
echo "📝 Useful Commands:"
echo "  • Check status: sudo systemctl status techstore-backend"
echo "  • View logs: sudo journalctl -u techstore-backend -f"
echo "  • Restart: sudo systemctl restart techstore-backend"
echo "  • Stop: sudo systemctl stop techstore-backend"
echo ""
echo "🔧 Configuration file: $APP_DIR/.env"
echo "📁 Application directory: $APP_DIR"
echo ""
