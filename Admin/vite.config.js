import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // FastAPI backend (products, orders, users, etc.)
      '/api/v1': {
        target: process.env.VITE_API_TARGET || 'http://localhost:7999',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
      // WhatsApp MCP bot control server (qr, status, analytics, chats, etc.)
      '/api': {
        target: process.env.VITE_BOT_TARGET || 'http://localhost:7998',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
    }
  }
})
