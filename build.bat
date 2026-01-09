@echo on

rmdir /s /q "out"

mkdir out
mkdir out\node_modules
mkdir out\node_modules\@duckdb

@REM Copy DuckDB dependencies to output directory for inclusion in extension package
@REM Both node-api and node-bindings are needed for proper module resolution
xcopy /s /y /i node_modules\@duckdb\node-api out\node_modules\@duckdb\node-api\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

xcopy /s /y /i node_modules\@duckdb\node-bindings out\node_modules\@duckdb\node-bindings\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

@REM Copy platform-specific DuckDB binaries (Windows version)
for /d %%d in (node_modules\@duckdb\node-bindings-*) do (
    xcopy /s /y /i "%%d" "out\node_modules\@duckdb\%%~nxd\"
)

copy /y node_modules\parquet-wasm\node\parquet_wasm_bg.wasm out\
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%

@REM Run esbuild for extension.ts
echo Run esbuild for extension.ts
esbuild src\extension.ts --bundle --outfile=out\extension.js --external:vscode --external:nock --external:aws-sdk --external:mock-aws-s3 --external:@duckdb/node-api --external:@duckdb/node-bindings --external:@duckdb/node-bindings-* --format=cjs --platform=node --minify --define:process.env.AZURE_APP_INSIGHTS_CONNECTION_STRING="\"%AZURE_APP_INSIGHTS_CONNECTION_STRING%\""
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
