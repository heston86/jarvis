#!/bin/bash
API_KEY=$(grep ANTHROPIC_API_KEY .env | cut -d= -f2)
curl -s https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":50,"messages":[{"role":"user","content":"Say hello"}]}'
echo ""
