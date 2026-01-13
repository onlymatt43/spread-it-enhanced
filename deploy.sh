#!/bin/bash

# Spread-It Enhanced Deployment Script
# This script helps deploy the application to Vercel or Render

set -e

echo "🚀 Spread-It Enhanced Deployment Script"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "spread-it-standalone/package.json" ]; then
    echo "❌ Error: Please run this script from the root directory of the project"
    exit 1
fi

# Function to deploy to Vercel
deploy_vercel() {
    echo "📦 Deploying to Vercel..."
    cd spread-it-standalone

    # Check if Vercel CLI is installed
    if ! command -v vercel &> /dev/null; then
        echo "❌ Vercel CLI not found. Install it with: npm i -g vercel"
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f ".env" ]; then
        echo "⚠️  Warning: .env file not found. Please create one based on .env.example"
        echo "   Copy .env.example to .env and fill in your API keys"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Deploy
    vercel --prod

    cd ..
    echo "✅ Vercel deployment completed!"
}

# Function to deploy to Render
deploy_render() {
    echo "📦 Deploying to Render..."
    echo "Note: Make sure you have:"
    echo "  1. Created a Render account"
    echo "  2. Connected your GitHub repository"
    echo "  3. Set up environment variables in Render dashboard"
    echo ""
    echo "Repository URL: https://github.com/onlymatt43/spread-it-enhanced"
    echo "Build Command: npm install"
    echo "Start Command: npm start"
    echo ""
    echo "Required Environment Variables:"
    echo "  - OPENAI_API_KEY"
    echo "  - GOOGLE_CLOUD_VISION_KEY"
    echo "  - MONGODB_URI"
    echo "  - SESSION_SECRET"
    echo "  - API_KEY"
    echo "  (plus social media tokens as needed)"
}

# Function to setup local development
setup_local() {
    echo "🏠 Setting up local development environment..."
    cd spread-it-standalone

    # Install dependencies
    echo "Installing dependencies..."
    npm install

    # Check for .env file
    if [ ! -f ".env" ]; then
        echo "Creating .env file from template..."
        cp .env.example .env
        echo "⚠️  Please edit .env file with your actual API keys"
    fi

    # Create uploads directory
    mkdir -p uploads

    cd ..
    echo "✅ Local setup completed!"
    echo "Run 'cd spread-it-standalone && npm run dev' to start development server"
}

# Main menu
echo "Choose deployment option:"
echo "1) Deploy to Vercel"
echo "2) Deploy to Render (manual setup required)"
echo "3) Setup local development"
echo "4) Exit"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        deploy_vercel
        ;;
    2)
        deploy_render
        ;;
    3)
        setup_local
        ;;
    4)
        echo "Goodbye! 👋"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment process completed!"
echo "Don't forget to:"
echo "  - Configure your environment variables"
echo "  - Test the application"
echo "  - Update your WordPress plugin configuration if using integration"