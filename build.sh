#!/bin/bash

set -e # Exit immediately if a command exits with a non-zero status

rm -rf ./out
mkdir ./out ./out/binding/

# DuckDB bindings are now handled as externals
cp ./node_modules/parquet-wasm/node/parquet_wasm_bg.wasm ./out

esbuild ./src/extension.ts --bundle --outfile=out/extension.js --external:vscode --external:nock --external:aws-sdk --external:mock-aws-s3 --external:@duckdb/node-api --external:@duckdb/node-bindings --external:@duckdb/node-bindings-* --format=cjs --platform=node --minify --define:process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING='"'"$AZURE_APP_INSIGHTS_CONNECTION_STRING"'"'
esbuild ./src/worker.ts --bundle --outfile=out/worker.js --external:vscode --external:nock --external:aws-sdk --external:mock-aws-s3 --external:@duckdb/node-api --external:@duckdb/node-bindings --external:@duckdb/node-bindings-* --format=cjs --platform=node --minify
