#!/bin/bash

echo "🚀 RAG Performance Setup Script"
echo "================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is available"

# Check if docker-compose is available
if ! command -v docker compose &> /dev/null; then
    echo "❌ docker compose is not installed. Please install docker compose first."
    exit 1
fi

echo "✅ docker compose is available"

# Start ChromaDB
echo "🐳 Starting ChromaDB..."
docker compose up -d

# Wait for ChromaDB to be ready
echo "⏳ Waiting for ChromaDB to be ready..."
sleep 10

# Check if ChromaDB is responding
if curl -s http://localhost:8000/api/v1/heartbeat &> /dev/null; then
    echo "✅ ChromaDB is running successfully"
else
    echo "⚠️  ChromaDB might still be starting up. You can check with:"
    echo "   curl http://localhost:8000/api/v1/heartbeat"
fi

# Install dependencies
echo "📦 Installing dependencies..."
bun install

# Create cache directory
echo "📁 Creating cache directory..."
mkdir -p ./.vector-cache

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start your application: bun run dev"
echo "2. The first run will process all documents (this may take a few minutes)"
echo "3. Subsequent runs will be much faster due to caching"
echo ""
echo "Useful commands:"
echo "- Check ChromaDB status: docker ps | grep chroma"
echo "- View ChromaDB logs: docker-compose logs chroma"
echo "- Clear cache: rm -rf ./.vector-cache"
echo "- Stop ChromaDB: docker-compose down" 