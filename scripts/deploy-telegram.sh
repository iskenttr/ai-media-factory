#!/bin/bash
# Telegram Bot - Google Cloud Run Deployment Script

set -e

PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"europe-west1"}
SERVICE_NAME="ai-media-felegram-bot"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🔧 Deploying Telegram Bot to Google Cloud Run..."

# Build and push Docker image
echo "📦 Building Docker image..."
gcloud builds submit --tag ${IMAGE_NAME} --dockerfile Dockerfile.telegram

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --set-env-vars "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}" \
  --set-env-vars "TELEGRAM_ADMIN_IDS=${TELEGRAM_ADMIN_IDS}" \
  --set-env-vars "AMF_ROOT=/app" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 1

echo "✅ Deployment complete!"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format "value(status.url)")
echo "🌐 Service URL: ${SERVICE_URL}"
