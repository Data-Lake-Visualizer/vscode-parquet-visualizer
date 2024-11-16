@echo on

@REM REM Copy required files
copy /y node_modules\duckdb-async\node_modules\duckdb\lib\binding\duckdb.node out\binding\
copy /y node_modules\parquet-wasm\node\parquet_wasm_bg.wasm out\

@REM Run esbuild for worker.ts
echo Run esbuild for worker.ts
esbuild src\worker.ts --bundle --outfile=out\worker.js --external:vscode --external:nock --external:aws-sdk --external:mock-aws-s3 --format=cjs --platform=node --minify