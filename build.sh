#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status

rm -rf ./out
mkdir -p ./out ./out/node_modules/@duckdb/

# Copy DuckDB dependencies to output directory for inclusion in extension package
# Both node-api and node-bindings are needed for proper module resolution
cp -r ./node_modules/@duckdb/node-api ./out/node_modules/@duckdb/
cp -r ./node_modules/@duckdb/node-bindings ./out/node_modules/@duckdb/
cp -r ./node_modules/@duckdb/node-bindings-* ./out/node_modules/@duckdb/ 2>/dev/null || echo "No platform-specific bindings found"

# Copy parquet-wasm
cp ./node_modules/parquet-wasm/node/parquet_wasm_bg.wasm ./out

esbuild ./src/extension.ts --bundle --outfile=out/extension.js --external:vscode --external:nock --external:aws-sdk --external:mock-aws-s3 --external:@duckdb/node-api --external:@duckdb/node-bindings --external:@duckdb/node-bindings-* --format=cjs --platform=node --minify --define:process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING='"'"$AZURE_APP_INSIGHTS_CONNECTION_STRING"'"'
esbuild ./src/worker.ts --bundle --outfile=out/worker.js --external:vscode --external:nock --external:aws-sdk --external:mock-aws-s3 --external:@duckdb/node-api --external:@duckdb/node-bindings --external:@duckdb/node-bindings-* --format=cjs --platform=node --minify
