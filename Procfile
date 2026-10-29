web: if [ "$SCALINGO_PREVIEW_SAFE_MODE" = "true" ] && [ "$SCALINGO_PREVIEW_UI_ENABLED" = "true" ]; then exec node scripts/serve-scalingo-ui-preview.mjs; else exec node server.mjs; fi
