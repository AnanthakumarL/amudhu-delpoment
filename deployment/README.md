# TechStore Backend - Production Deployment

Simple two-command deployment for Ubuntu server.

## 🚀 Deploy in 2 Commands

### Step 1: Setup Weaviate Database (Port 8080)

```bash
cd deployment
./setup_weaviate.sh
```

Installs Docker, downloads Weaviate, and starts it on port 8080.

**Verify:** `curl http://localhost:8080/v1/.well-known/ready`

### Step 2: Deploy Backend (Port 8000)

```bash
./deploy_backend.sh
```

Installs Python, sets up systemd service, starts backend on port 8000 with 4 workers (supports ~10 concurrent users), and populates sample data.

**Verify:** `curl http://localhost:8000/health`

## 📊 Access Points

- **API:** http://YOUR_SERVER_IP:8000
- **API Docs:** http://YOUR_SERVER_IP:8000/docs
- **Weaviate:** http://YOUR_SERVER_IP:8080


## 🔧 Manage Services

**Backend:**
```bash
sudo systemctl status techstore-backend        # Check status
sudo journalctl -u techstore-backend -f        # View logs
sudo systemctl restart techstore-backend       # Restart
```

**Weaviate:**
```bash
docker ps                                       # Check status
docker logs weaviate -f                         # View logs
docker restart weaviate                         # Restart
```

## 🐛 Quick Fixes

**Backend not responding?**
```bash
sudo systemctl restart techstore-backend
```

**Weaviate not working?**
```bash
docker restart weaviate
```

## 📦 Requirements

- Ubuntu 20.04+
- 4GB RAM (8GB recommended)
- 2 CPU cores
- 20GB disk space
